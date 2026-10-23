import { and, asc, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import type { MySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { coupleOf } from './auth.ts';
import { db, schema } from './db/index.ts';
import { FILE_NAME_RE, removeFiles } from './files.ts';
import { mediaFiles, normalizeMedia } from './media.ts';
import { broadcast } from './realtime.ts';
import { notifyPartner, snippet } from './webPush.ts';
import { visibleAnswers } from './answerPrivacy.ts';
import { momentPagination } from './momentPagination.ts';
import { validAmapUrl } from './amap.ts';
import { visitFromMoment } from './momentVisit.ts';

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
export const stickerRef = z.string().max(100).regex(/^(blob:[a-z0-9-]{1,40}|[0-9a-f-]{36}\.(jpg|png|gif|webp))$/, '表情不对');

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

type Row = Record<string, unknown> & { id: string; createdBy?: string | null };

/** 引用的店 / 动态必须是这一对自己的 */
async function ownedBy(table: MySqlTable & { id: MySqlColumn; coupleId: MySqlColumn }, coupleId: string, id: unknown, message: string) {
  if (id === undefined || id === null) return;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.coupleId, coupleId), eq(table.id, String(id))));
  if (!row) badRequest(message);
}

interface Resource {
  name: string;
  table: MySqlTable & { id: MySqlColumn; coupleId: MySqlColumn; createdBy?: MySqlColumn };
  body: z.ZodObject;
  /** ?query 参数 -> 列 */
  filters?: Record<string, MySqlColumn>;
  order: SQL[];
  /** 只有创建者能修改；true 时删除也只能创建者，'edit' 时两个人都能删除 */
  ownerOnly?: boolean | 'edit';
  beforeSave?: (data: Record<string, unknown>, prev?: Row) => void;
  /** 保存前检查引用（例如探店记录的店是不是这一对的） */
  checkRefs?: (data: Record<string, unknown>, coupleId: string) => Promise<void>;
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
    checkRefs: (data, coupleId) => ownedBy(s.places, coupleId, data.placeId, '这家店不存在'),
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
    checkRefs: (data, coupleId) => ownedBy(s.moments, coupleId, data.momentId, '这条动态不存在'),
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
    checkRefs: (data, coupleId) => ownedBy(s.places, coupleId, data.placeId, '这家店不存在'),
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

/** 新内容提醒另一半（网页推送） */
async function notifyCreated(name: string, data: Record<string, unknown>, by: string, log: (error: unknown) => void) {
  try {
    if (name === 'moments') {
      const text = snippet(data.content);
      const media = Array.isArray(data.media) ? data.media.length : Array.isArray(data.photos) ? data.photos.length : 0;
      notifyPartner(by, { title: '{name} 发了新动态', body: text || (media ? `分享了 ${media} 张照片 / 视频` : '快去看看'), url: '/moments', tag: 'moment' }, log);
    } else if (name === 'comments') {
      const [moment] = await db.select({ createdBy: s.moments.createdBy }).from(s.moments).where(eq(s.moments.id, String(data.momentId)));
      const what = snippet(data.content) || (data.image ? '[图片]' : data.sticker ? '[表情]' : '');
      const reply = data.replyToId ? (await db.select({ createdBy: s.comments.createdBy }).from(s.comments).where(eq(s.comments.id, String(data.replyToId))))[0] : null;
      const verb = reply && reply.createdBy !== by ? '回复了你' : moment?.createdBy !== by ? '评论了你的动态' : '评论了动态';
      notifyPartner(by, { title: `{name} ${verb}`, body: what, url: '/moments', tag: `comment-${data.momentId}` }, log);
    } else if (name === 'places' && data.status !== 'visited') {
      notifyPartner(by, { title: '{name} 收藏了一家店', body: `想和你一起去：${snippet(data.name, 30)} 🍜`, url: '/eats', tag: 'place' }, log);
    }
  } catch (error) {
    log(error);
  }
}

export async function resourceRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.paired };

  for (const r of resources) {
    const t = r.table;
    const base = `/api/${r.name}`;
    const find = async (coupleId: string, id: string) => ((await db.select().from(t).where(and(eq(t.coupleId, coupleId), eq(t.id, id))).limit(1)) as Row[])[0];
    const changed = (coupleId: string, id: string | undefined, by: string) => {
      broadcast(coupleId, { type: 'change', collection: r.name, id, by });
      if (r.name === 'comments') broadcast(coupleId, { type: 'change', collection: 'moments', by });
    };

    if (r.name !== 'moments') {
      app.get(base, auth, async (req) => {
        const q = req.query as Record<string, string>;
        const conds = Object.entries(r.filters ?? {})
          .filter(([k]) => q[k])
          .map(([k, col]) => eq(col, q[k]));
        return db.select().from(t).where(and(eq(t.coupleId, coupleOf(req)), ...conds)).orderBy(...r.order);
      });
    }

    app.get(`${base}/:id`, auth, async (req, reply) => {
      const row = await find(coupleOf(req), (req.params as { id: string }).id);
      return row ?? reply.code(404).send({ message: '不存在' });
    });

    app.post(base, auth, async (req) => {
      const data: Record<string, unknown> = r.body.parse(req.body);
      const coupleId = coupleOf(req);
      r.beforeSave?.(data);
      await r.checkRefs?.(data, coupleId);
      const id = crypto.randomUUID();
      await db.insert(t).values({ ...data, id, coupleId, createdBy: req.user.sub } as never);
      changed(coupleId, id, req.user.sub);
      void notifyCreated(r.name, data, req.user.sub, (e) => req.log.warn(e, 'web push failed'));
      const row = await find(coupleId, id);
      // 带餐厅的动态：顺便记一次探店（失败不影响动态本身）
      if (r.name === 'moments' && row?.placeId) await visitFromMoment(row as never, req.user.sub, coupleId).catch((e) => req.log.warn(e, 'visit from moment failed'));
      return row;
    });

    app.patch(`${base}/:id`, auth, async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const coupleId = coupleOf(req);
      const prev = await find(coupleId, id);
      if (!prev) return reply.code(404).send({ message: '不存在' });
      if (r.ownerOnly && prev.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能修改自己发的内容' });
      const data: Record<string, unknown> = r.body.partial().parse(req.body);
      // 只对请求里出现的字段生效（partial 之后 default 不会补值）
      for (const k of Object.keys(data)) if (!(k in (req.body as object))) delete data[k];
      r.beforeSave?.(data, prev);
      await r.checkRefs?.(data, coupleId);
      if (Object.keys(data).length) await db.update(t).set(data as never).where(eq(t.id, id));
      // 被替换掉的照片清理掉
      if (r.filesOf) {
        const before = new Set(await r.filesOf(prev));
        const now = new Set(await r.filesOf({ ...prev, ...data } as Row));
        await removeFiles([...before].filter((f) => !now.has(f)));
      }
      changed(coupleId, id, req.user.sub);
      return find(coupleId, id);
    });

    app.delete(`${base}/:id`, auth, async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const coupleId = coupleOf(req);
      const prev = await find(coupleId, id);
      if (!prev) return { ok: true };
      if (r.ownerOnly === true && prev.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能删除自己发的内容' });
      const files = (await r.filesOf?.(prev)) ?? [];
      await db.delete(t).where(eq(t.id, id));
      await removeFiles(files);
      changed(coupleId, id, req.user.sub);
      return { ok: true };
    });
  }

  // ---- 动态：带上点赞和评论一次返回
  app.get('/api/moments', auth, async (req) => {
    const q = req.query as { limit?: string; before?: string };
    const { limit, before } = momentPagination(q);
    const coupleId = coupleOf(req);
    let cursor: SQL | undefined;
    if (before) {
      cursor = or(lt(s.moments.createdAt, before.at), and(eq(s.moments.createdAt, before.at), lt(s.moments.id, before.id)));
    }
    const rows = await db.select().from(s.moments).where(and(eq(s.moments.coupleId, coupleId), cursor)).orderBy(desc(s.moments.createdAt), desc(s.moments.id)).limit(limit);
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

  app.post('/api/moments/:id/like', auth, async (req, reply) => {
    const momentId = (req.params as { id: string }).id;
    const coupleId = coupleOf(req);
    const [moment] = await db.select({ createdBy: s.moments.createdBy, content: s.moments.content }).from(s.moments).where(and(eq(s.moments.coupleId, coupleId), eq(s.moments.id, momentId)));
    if (!moment) return reply.code(404).send({ message: '这条动态不存在' });
    const where = and(eq(s.momentLikes.momentId, momentId), eq(s.momentLikes.userId, req.user.sub));
    const [existing] = await db.select().from(s.momentLikes).where(where);
    if (existing) await db.delete(s.momentLikes).where(where);
    else await db.insert(s.momentLikes).values({ momentId, userId: req.user.sub });
    broadcast(coupleId, { type: 'change', collection: 'moments', id: momentId, by: req.user.sub });
    if (!existing) {
      if (moment.createdBy !== req.user.sub) {
        const text = snippet(moment.content, 20);
        notifyPartner(req.user.sub, { title: '{name}', body: `赞了你的动态${text ? `「${text}」` : ''} ❤️`, url: '/moments', tag: `like-${momentId}` }, (e) => req.log.warn(e, 'web push failed'));
      }
    }
    return { liked: !existing };
  });

  // ---- 每日一问：每人每天一条，可修改
  app.get('/api/answers', auth, async (req) => {
    const { day } = z.object({ day: dateStr }).parse(req.query);
    return visibleAnswers(await db.select().from(s.answers).where(and(eq(s.answers.coupleId, coupleOf(req)), eq(s.answers.day, day))), req.user.sub);
  });

  app.put('/api/answers/:day', auth, async (req) => {
    const day = dateStr.parse((req.params as { day: string }).day);
    const body = z.object({ question: z.number().int().min(0), content: z.string().trim().min(1).max(1000) }).parse(req.body);
    const coupleId = coupleOf(req);
    const ofDay = and(eq(s.answers.coupleId, coupleId), eq(s.answers.day, day));
    const [answered] = await db.select({ day: s.answers.day }).from(s.answers).where(and(ofDay, eq(s.answers.createdBy, req.user.sub))).limit(1);
    await db
      .insert(s.answers)
      .values({ day, ...body, coupleId, createdBy: req.user.sub })
      .onDuplicateKeyUpdate({ set: { content: body.content } });
    broadcast(coupleId, { type: 'change', collection: 'answers', by: req.user.sub });
    if (!answered) notifyPartner(req.user.sub, { title: '{name}', body: '回答了今天的问题，你也来答一下就能看到 TA 的答案 💌', url: '/question', tag: `answer-${day}` }, (e) => req.log.warn(e, 'web push failed'));
    return visibleAnswers(await db.select().from(s.answers).where(ofDay), req.user.sub);
  });

  app.get('/api/answers/history', auth, async (req) => {
    return visibleAnswers(await db.select().from(s.answers).where(eq(s.answers.coupleId, coupleOf(req))).orderBy(desc(s.answers.day)).limit(200), req.user.sub);
  });
}
