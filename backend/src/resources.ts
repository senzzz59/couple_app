import { and, asc, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import type { MySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db, schema } from './db/index.ts';
import { FILE_NAME_RE, removeFiles } from './files.ts';
import { mediaFiles, normalizeMedia } from './media.ts';
import { broadcast } from './realtime.ts';
import { visibleAnswers } from './answerPrivacy.ts';
import { momentPagination } from './momentPagination.ts';
import { validAmapUrl } from './amap.ts';

const s = schema;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const file = z.string().max(100);
const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();
const uploaded = z.string().regex(FILE_NAME_RE, '文件名不对');
export const mediaItem = z.object({
  kind: z.enum(['image', 'video', 'live']),
  image: opt(uploaded),
  video: opt(uploaded),
  w: opt(z.number().int().min(0).max(100000)),
  h: opt(z.number().int().min(0).max(100000)),
  duration: opt(z.number().min(0).max(24 * 3600)),
});
// 内置表情（blob:xxx）或自定义表情图片
const stickerRef = z.string().max(100).regex(/^(blob:[a-z0-9-]{1,40}|[0-9a-f-]{36}\.(jpg|png|gif|webp))$/, '表情不对');

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

type Row = Record<string, unknown> & { id: string; createdBy?: string | null };

interface Resource {
  name: string;
  table: MySqlTable & { id: MySqlColumn; createdBy?: MySqlColumn };
  body: z.ZodObject;
  /** ?query 参数 -> 列 */
  filters?: Record<string, MySqlColumn>;
  order: SQL[];
  /** 只有创建者能修改；true 时删除也只能创建者，'edit' 时两个人都能删除 */
  ownerOnly?: boolean | 'edit';
  beforeSave?: (data: Record<string, unknown>, prev?: Row) => void;
  /** 删除前收集需要清理的文件 */
  filesOf?: (row: Row) => Promise<(string | null | undefined)[]>;
}

const resources: Resource[] = [
  {
    name: 'places',
    table: s.places,
    body: z.object({
      name: z.string().trim().min(1).max(80),
      address: opt(z.string().max(200)),
      city: opt(z.string().max(40)),
      lat: opt(z.number()),
      lng: opt(z.number()),
      category: opt(z.string().max(20)),
      status: z.enum(['want', 'visited']),
      rating: opt(z.number().min(0).max(5)),
      price: opt(z.number().int().min(0)),
      xhsUrl: opt(z.string().max(500)),
      amapUrl: opt(z.string().max(2000).refine(validAmapUrl, '请使用高德地图的地点分享链接')),
      note: opt(z.string().max(2000)),
      cover: opt(file),
      amapPhoto: opt(z.string().max(600).refine((u) => u === '' || /^https:\/\/[^\s"'<>]+$/.test(u), '图片地址不对')),
    }),
    filters: { status: s.places.status },
    order: [desc(s.places.updatedAt)],
    filesOf: async (row) => {
      const vs = await db.select({ photos: s.visits.photos }).from(s.visits).where(eq(s.visits.placeId, row.id));
      return [row.cover as string, ...vs.flatMap((v) => v.photos)];
    },
  },
  {
    name: 'visits',
    table: s.visits,
    body: z.object({
      placeId: z.string().length(36),
      date: dateStr,
      photos: z.array(file).max(20).default([]),
      dishes: z.array(z.object({ name: z.string().trim().min(1).max(40), liked: z.boolean().optional() })).max(50).default([]),
      rating: opt(z.number().min(0).max(5)),
      note: opt(z.string().max(3000)),
    }),
    filters: { place: s.visits.placeId },
    order: [desc(s.visits.date), desc(s.visits.createdAt)],
    filesOf: async (row) => row.photos as string[],
  },
  {
    name: 'anniversaries',
    table: s.anniversaries,
    body: z.object({
      title: z.string().trim().min(1).max(40),
      date: dateStr,
      kind: z.enum(['love', 'birthday', 'custom']).default('custom'),
      lunar: z.boolean().default(false),
      yearly: z.boolean().default(true),
      remind: z.array(z.number().int().min(0).max(60)).max(5).default([0]),
      emoji: opt(z.string().max(16)),
    }),
    order: [asc(s.anniversaries.date)],
  },
  {
    name: 'todos',
    table: s.todos,
    body: z.object({
      title: z.string().trim().min(1).max(120),
      note: opt(z.string().max(1000)),
      done: z.boolean().default(false),
      due: opt(z.coerce.date()),
      assigneeId: opt(z.string().length(36)),
      category: opt(z.string().max(20)),
    }),
    order: [asc(s.todos.done), desc(s.todos.createdAt)],
    beforeSave: (data, prev) => {
      if (data.done !== undefined && data.done !== prev?.done) data.doneAt = data.done ? new Date() : null;
    },
  },
  {
    name: 'comments',
    table: s.comments,
    body: z.object({
      momentId: z.string().length(36),
      content: z.string().trim().max(500).default(''),
      replyToId: opt(z.string().length(36)),
      image: opt(uploaded),
      sticker: opt(stickerRef),
    }),
    filters: { moment: s.comments.momentId },
    order: [asc(s.comments.createdAt)],
    ownerOnly: 'edit',
    beforeSave: (data, prev) => {
      const next = { ...prev, ...data };
      if (!String(next.content ?? '').trim() && !next.image && !next.sticker) badRequest('说点什么，或者发个表情 / 图片');
    },
    filesOf: async (row) => [row.image as string | null],
  },
  {
    name: 'stickers',
    table: s.stickers,
    body: z.object({ file: uploaded }),
    order: [desc(s.stickers.createdAt)],
    // 评论里还在用这个表情图，删除表情时不删文件
  },
  {
    name: 'moments',
    table: s.moments,
    body: z.object({
      content: opt(z.string().max(3000)),
      photos: z.array(file).max(9).default([]),
      media: opt(z.array(mediaItem).max(9)),
      mood: opt(z.string().max(16)),
      placeId: opt(z.string().length(36)),
    }),
    order: [desc(s.moments.createdAt)],
    ownerOnly: 'edit',
    beforeSave: (data) => {
      // 旧版 App 只认 photos：把图片 / 封面同步过去
      if (Array.isArray(data.media)) data.photos = (data.media as { image?: string | null }[]).map((m) => m.image).filter(Boolean);
    },
    filesOf: async (row) => {
      const cs = await db.select({ image: s.comments.image }).from(s.comments).where(eq(s.comments.momentId, row.id));
      return [...new Set([...(row.photos as string[]), ...mediaFiles(row.media as never), ...cs.map((c) => c.image)])];
    },
  },
];

export async function resourceRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  for (const r of resources) {
    const t = r.table;
    const base = `/api/${r.name}`;
    const find = async (id: string) => ((await db.select().from(t).where(eq(t.id, id)).limit(1)) as Row[])[0];
    const changed = (id: string | undefined, by: string) => {
      broadcast({ type: 'change', collection: r.name, id, by });
      if (r.name === 'comments') broadcast({ type: 'change', collection: 'moments', by });
    };

    if (r.name !== 'moments') {
      app.get(base, auth, async (req) => {
        const q = req.query as Record<string, string>;
        const conds = Object.entries(r.filters ?? {})
          .filter(([k]) => q[k])
          .map(([k, col]) => eq(col, q[k]));
        return db.select().from(t).where(and(...conds)).orderBy(...r.order);
      });
    }

    app.get(`${base}/:id`, auth, async (req, reply) => {
      const row = await find((req.params as { id: string }).id);
      return row ?? reply.code(404).send({ message: '不存在' });
    });

    app.post(base, auth, async (req) => {
      const data: Record<string, unknown> = r.body.parse(req.body);
      r.beforeSave?.(data);
      const id = crypto.randomUUID();
      await db.insert(t).values({ ...data, id, createdBy: req.user.sub } as never);
      changed(id, req.user.sub);
      return find(id);
    });

    app.patch(`${base}/:id`, auth, async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const prev = await find(id);
      if (!prev) return reply.code(404).send({ message: '不存在' });
      if (r.ownerOnly && prev.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能修改自己发的内容' });
      const data: Record<string, unknown> = r.body.partial().parse(req.body);
      // 只对请求里出现的字段生效（partial 之后 default 不会补值）
      for (const k of Object.keys(data)) if (!(k in (req.body as object))) delete data[k];
      r.beforeSave?.(data, prev);
      if (Object.keys(data).length) await db.update(t).set(data as never).where(eq(t.id, id));
      // 被替换掉的照片清理掉
      if (r.filesOf) {
        const before = new Set(await r.filesOf(prev));
        const now = new Set(await r.filesOf({ ...prev, ...data } as Row));
        await removeFiles([...before].filter((f) => !now.has(f)));
      }
      changed(id, req.user.sub);
      return find(id);
    });

    app.delete(`${base}/:id`, auth, async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const prev = await find(id);
      if (!prev) return { ok: true };
      if (r.ownerOnly === true && prev.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能删除自己发的内容' });
      const files = (await r.filesOf?.(prev)) ?? [];
      await db.delete(t).where(eq(t.id, id));
      await removeFiles(files);
      changed(id, req.user.sub);
      return { ok: true };
    });
  }

  // ---- 动态：带上点赞和评论一次返回
  app.get('/api/moments', auth, async (req) => {
    const q = req.query as { limit?: string; before?: string };
    const { limit, before } = momentPagination(q);
    let cursor: SQL | undefined;
    if (before) {
      cursor = or(lt(s.moments.createdAt, before.at), and(eq(s.moments.createdAt, before.at), lt(s.moments.id, before.id)));
    }
    const rows = await db.select().from(s.moments).where(cursor).orderBy(desc(s.moments.createdAt), desc(s.moments.id)).limit(limit);
    if (!rows.length) return [];
    const ids = rows.map((m) => m.id);
    const likes = await db.select().from(s.momentLikes).where(inArray(s.momentLikes.momentId, ids));
    const cmts = await db.select().from(s.comments).where(inArray(s.comments.momentId, ids)).orderBy(asc(s.comments.createdAt));
    return rows.map((m) => ({
      ...m,
      media: normalizeMedia(m.photos, m.media),
      likedBy: likes.filter((l) => l.momentId === m.id).map((l) => l.userId),
      comments: cmts.filter((c) => c.momentId === m.id),
    }));
  });

  app.post('/api/moments/:id/like', auth, async (req) => {
    const momentId = (req.params as { id: string }).id;
    const where = and(eq(s.momentLikes.momentId, momentId), eq(s.momentLikes.userId, req.user.sub));
    const [existing] = await db.select().from(s.momentLikes).where(where);
    if (existing) await db.delete(s.momentLikes).where(where);
    else await db.insert(s.momentLikes).values({ momentId, userId: req.user.sub });
    broadcast({ type: 'change', collection: 'moments', id: momentId, by: req.user.sub });
    return { liked: !existing };
  });

  // ---- 每日一问：每人每天一条，可修改
  app.get('/api/answers', auth, async (req) => {
    const { day } = z.object({ day: dateStr }).parse(req.query);
    return visibleAnswers(await db.select().from(s.answers).where(eq(s.answers.day, day)), req.user.sub);
  });

  app.put('/api/answers/:day', auth, async (req) => {
    const day = dateStr.parse((req.params as { day: string }).day);
    const body = z.object({ question: z.number().int().min(0), content: z.string().trim().min(1).max(1000) }).parse(req.body);
    await db
      .insert(s.answers)
      .values({ day, ...body, createdBy: req.user.sub })
      .onDuplicateKeyUpdate({ set: { content: body.content } });
    broadcast({ type: 'change', collection: 'answers', by: req.user.sub });
    return visibleAnswers(await db.select().from(s.answers).where(eq(s.answers.day, day)), req.user.sub);
  });

  app.get('/api/answers/history', auth, async (req) => {
    return visibleAnswers(await db.select().from(s.answers).orderBy(desc(s.answers.day)).limit(200), req.user.sub);
  });
}
