import { and, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { coupleOf } from './auth.ts';
import { partnerOf } from './couple.ts';
import { db, schema } from './db/index.ts';
import { FILE_NAME_RE, removeFiles, VOICE_RE } from './files.ts';
import { broadcast, sendTo } from './realtime.ts';
import { stickerRef } from './resources.ts';
import { notifyPartner, snippet } from './webPush.ts';

const s = schema;
const m = s.messages;
const g = s.galleryItems;
const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();

/** 自己发的消息多久内可以撤回 */
export const RECALL_MS = 2 * 60_000;
export const VOICE_MAX_SECONDS = 60;

export const messageInput = z
  .object({
    kind: z.enum(['text', 'image', 'sticker', 'voice', 'photo']),
    content: z.string().trim().max(1000, '一条消息最多 1000 字').optional(),
    image: opt(z.string().regex(FILE_NAME_RE, '图片不对')),
    sticker: opt(stickerRef),
    voice: opt(z.string().regex(VOICE_RE, '语音不对')),
    duration: opt(z.number().min(0).max(VOICE_MAX_SECONDS + 5)),
    galleryId: opt(z.string().length(36)),
    replyToId: opt(z.string().length(36)),
  })
  .transform((b) => {
    // 每种消息只留它用得到的字段
    const base = { kind: b.kind, replyToId: b.replyToId ?? null, content: null as string | null, image: null as string | null, sticker: null as string | null, voice: null as string | null, duration: null as number | null, galleryId: null as string | null };
    if (b.kind === 'text') return { ...base, content: b.content ?? '' };
    if (b.kind === 'image') return { ...base, image: b.image ?? null };
    if (b.kind === 'sticker') return { ...base, sticker: b.sticker ?? null };
    if (b.kind === 'voice') return { ...base, voice: b.voice ?? null, duration: b.duration ?? null };
    return { ...base, galleryId: b.galleryId ?? null, content: b.content || null };
  })
  .refine((b) => (b.kind === 'text' ? !!b.content : b.kind === 'image' ? !!b.image : b.kind === 'sticker' ? !!b.sticker : b.kind === 'voice' ? !!b.voice : !!b.galleryId), '消息是空的');

/** 推送 / 提示里显示的一句话 */
export function preview(msg: { kind: string; content: string | null }) {
  if (msg.kind === 'text') return snippet(msg.content);
  if (msg.kind === 'image') return '[图片]';
  if (msg.kind === 'sticker') return '[表情]';
  if (msg.kind === 'voice') return '[语音]';
  return '[照片] 想给你看这张';
}

const galleryCols = {
  id: g.id,
  kind: g.kind,
  image: g.image,
  video: g.video,
  original: g.original,
  fileName: g.fileName,
  width: g.width,
  height: g.height,
  duration: g.duration,
  size: g.size,
  takenAt: g.takenAt,
  favorite: g.favorite,
  createdBy: g.createdBy,
};

/** 带上引用的相册照片（删了就是 null）和被回复的消息（撤回了就是 null） */
async function loadMessages(coupleId: string, where: SQL | undefined, limit: number) {
  const rows = await db
    .select({ msg: m, gallery: galleryCols })
    .from(m)
    .leftJoin(g, and(eq(m.galleryId, g.id), eq(g.coupleId, coupleId)))
    .where(and(eq(m.coupleId, coupleId), where))
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(limit);
  const replyIds = [...new Set(rows.map((r) => r.msg.replyToId).filter((x): x is string => !!x))];
  const replies = replyIds.length
    ? await db.select({ id: m.id, kind: m.kind, content: m.content, image: m.image, sticker: m.sticker, createdBy: m.createdBy }).from(m).where(and(eq(m.coupleId, coupleId), inArray(m.id, replyIds)))
    : [];
  const byId = new Map(replies.map((r) => [r.id, r]));
  return rows.map(({ msg, gallery }) => ({
    ...msg,
    gallery: gallery?.id ? gallery : null,
    replyTo: msg.replyToId ? (byId.get(msg.replyToId) ?? null) : null,
  }));
}

export type ChatMessage = Awaited<ReturnType<typeof loadMessages>>[number];

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.paired };
  const changed = (coupleId: string, by: string) => broadcast(coupleId, { type: 'change', collection: 'chat', by });

  // ---- 消息列表：最新的在前，before 传一条消息的 id 往前翻
  app.get('/api/chat/messages', auth, async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), before: z.string().length(36).optional() }).parse(req.query);
    const coupleId = coupleOf(req);
    let where: SQL | undefined;
    if (q.before) {
      const [cur] = await db.select({ at: m.createdAt }).from(m).where(and(eq(m.coupleId, coupleId), eq(m.id, q.before)));
      if (cur) where = or(lt(m.createdAt, cur.at), and(eq(m.createdAt, cur.at), lt(m.id, q.before)));
    }
    return loadMessages(coupleId, where, q.limit);
  });

  app.post('/api/chat/messages', auth, async (req, reply) => {
    const body = messageInput.parse(req.body);
    const by = req.user.sub;
    const coupleId = coupleOf(req);
    if (body.galleryId) {
      const [item] = await db.select({ id: g.id }).from(g).where(and(eq(g.coupleId, coupleId), eq(g.id, body.galleryId)));
      if (!item) return reply.code(404).send({ message: '这张照片已经删除了' });
    }
    const id = crypto.randomUUID();
    await db.insert(m).values({ id, ...body, coupleId, createdBy: by });
    const [msg] = await loadMessages(coupleId, eq(m.id, id), 1);
    changed(coupleId, by);
    const partner = (await partnerOf(by, coupleId))?.id;
    const log = (e: unknown) => req.log.warn(e, 'chat push failed');
    if (partner) {
      sendTo(partner, { type: 'chat', message: msg });
      if (body.kind === 'photo') {
        sendTo(partner, { type: 'show', id, from: by, itemId: body.galleryId!, at: new Date().toISOString() });
        notifyPartner(by, { title: '{name}', body: '想给你看一张照片 👉', url: `/viewer?item=${body.galleryId}`, tag: 'show' }, log);
      } else {
        notifyPartner(by, { title: '{name}', body: preview(msg), url: '/chat', tag: 'chat' }, log);
      }
    }
    return msg;
  });

  // ---- 撤回：只能撤回自己 2 分钟内发的
  app.delete('/api/chat/messages/:id', auth, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const coupleId = coupleOf(req);
    const [row] = await db.select().from(m).where(and(eq(m.coupleId, coupleId), eq(m.id, id)));
    if (!row) return { ok: true };
    if (row.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能撤回自己的消息' });
    if (Date.now() - new Date(row.createdAt).getTime() > RECALL_MS) return reply.code(400).send({ message: '超过 2 分钟，不能撤回了' });
    await db.delete(m).where(eq(m.id, id));
    // 表情包的文件是表情库里的，不删
    await removeFiles([row.image, row.voice]);
    changed(coupleId, req.user.sub);
    return { ok: true };
  });

  // ---- 已读：读到现在
  app.post('/api/chat/read', auth, async (req) => {
    const now = new Date();
    await db.insert(s.chatReads).values({ userId: req.user.sub, readAt: now }).onDuplicateKeyUpdate({ set: { readAt: now } });
    changed(coupleOf(req), req.user.sub);
    return { readAt: now };
  });

  // ---- 未读数 + 对方读到哪（显示「已读」）
  app.get('/api/chat/unread', auth, async (req) => {
    const me = req.user.sub;
    const coupleId = coupleOf(req);
    const partner = await partnerOf(me, coupleId);
    const reads = await db.select().from(s.chatReads).where(inArray(s.chatReads.userId, partner ? [me, partner.id] : [me]));
    const mine = reads.find((r) => r.userId === me)?.readAt ?? null;
    const partnerReadAt = partner ? (reads.find((r) => r.userId === partner.id)?.readAt ?? null) : null;
    const conds: SQL[] = [eq(m.coupleId, coupleId), ne(m.createdBy, me)];
    if (mine) conds.push(gt(m.createdAt, mine));
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(m).where(and(...conds));
    return { count: Number(row?.count ?? 0), partnerReadAt };
  });
}
