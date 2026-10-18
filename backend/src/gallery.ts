import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { copyFile, FILE_NAME_RE, fileSource, ORIG_RE, removeFiles, removeOriginals } from './files.ts';
import { broadcast } from './realtime.ts';
import { notifyPartner } from './webPush.ts';
import { mediaItem } from './resources.ts';
import { downloadName, galleryCursor } from './media.ts';
import { uniqueNames, zipStream } from './zip.ts';

const s = schema;
const g = s.galleryItems;
const uploaded = z.string().regex(FILE_NAME_RE, '文件名不对');
// 原图 / 原片：和上传时生成的名字规则一致（要转码的视频会留一份 .mov / .mp4 原片）
const original = z.string().regex(ORIG_RE, '文件名不对');
const ids = z.array(z.string().length(36)).min(1).max(1000);
const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();

const itemInput = z
  .object({
    kind: z.enum(['image', 'video', 'live']),
    image: opt(uploaded),
    video: opt(uploaded),
    original: opt(original),
    fileName: opt(z.string().max(200)),
    width: opt(z.number().int().min(0).max(100000)),
    height: opt(z.number().int().min(0).max(100000)),
    duration: opt(z.number().min(0).max(24 * 3600)),
    size: opt(z.number().int().min(0)),
    takenAt: opt(z.coerce.date()),
  })
  .refine((i) => (i.kind === 'image' ? !!i.image : !!i.video), '照片或视频文件缺失');


export async function galleryRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const changed = (by: string, collection = 'gallery') => {
    broadcast({ type: 'change', collection, by });
    if (collection === 'gallery') broadcast({ type: 'change', collection: 'albums', by });
  };

  // ---- 照片列表：按拍摄时间倒序，可按相册 / 类型 / 收藏筛选
  app.get('/api/gallery', auth, async (req) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(10000).default(300),
        before: z.string().optional(),
        album: z.string().length(36).optional(),
        kind: z.enum(['image', 'video', 'live']).optional(),
        favorite: z.enum(['1']).optional(),
      })
      .parse(req.query);
    const cursor = galleryCursor(q.before);
    const conds: (SQL | undefined)[] = [];
    if (cursor) conds.push(or(lt(g.takenAt, cursor.at), and(eq(g.takenAt, cursor.at), lt(g.id, cursor.id))));
    if (q.kind) conds.push(eq(g.kind, q.kind));
    if (q.favorite) conds.push(eq(g.favorite, true));
    if (q.album) conds.push(inArray(g.id, db.select({ id: s.albumItems.itemId }).from(s.albumItems).where(eq(s.albumItems.albumId, q.album))));
    return db
      .select()
      .from(g)
      .where(and(...conds))
      .orderBy(desc(g.takenAt), desc(g.id))
      .limit(q.limit);
  });

  // ---- 每个月有多少（「跳到某年某月」用）：按看的人所在时区分月，和列表里的分组一致
  app.get('/api/gallery/months', auth, async (req) => {
    const q = z
      .object({
        kind: z.enum(['image', 'video', 'live']).optional(),
        favorite: z.enum(['1']).optional(),
        tz: z.string().max(64).optional(),
      })
      .parse(req.query);
    let tz = env.tz;
    if (q.tz) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: q.tz });
        tz = q.tz;
      } catch {
        // 不认识的时区：用服务器的
      }
    }
    const conds: (SQL | undefined)[] = [];
    if (q.kind) conds.push(eq(g.kind, q.kind));
    if (q.favorite) conds.push(eq(g.favorite, true));
    const rows = await db.select({ at: g.takenAt }).from(g).where(and(...conds));
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(r.at)).map((p) => [p.type, p.value]));
      const month = `${parts.year}-${parts.month}`;
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[0].localeCompare(a[0])).map(([month, count]) => ({ month, count }));
  });

  // ---- 数量统计（智能相册）
  app.get('/api/gallery/summary', auth, async () => {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        videos: sql<number>`coalesce(sum(${g.kind} = 'video'), 0)`,
        live: sql<number>`coalesce(sum(${g.kind} = 'live'), 0)`,
        favorites: sql<number>`coalesce(sum(${g.favorite}), 0)`,
      })
      .from(g);
    const latest = await db.select().from(g).orderBy(desc(g.takenAt), desc(g.id)).limit(4);
    const fav = await db.select().from(g).where(eq(g.favorite, true)).orderBy(desc(g.takenAt)).limit(1);
    const vid = await db.select().from(g).where(eq(g.kind, 'video')).orderBy(desc(g.takenAt)).limit(1);
    const live = await db.select().from(g).where(eq(g.kind, 'live')).orderBy(desc(g.takenAt)).limit(1);
    return {
      total: Number(row.total),
      videos: Number(row.videos),
      live: Number(row.live),
      favorites: Number(row.favorites),
      latest,
      covers: { favorites: fav[0] ?? null, videos: vid[0] ?? null, live: live[0] ?? null },
    };
  });

  // ---- 上传完成后登记到相册（可直接放进某个相册）
  app.post('/api/gallery', auth, async (req) => {
    const body = z.object({ items: z.array(itemInput).min(1).max(200), albumId: z.string().length(36).optional() }).parse(req.body);
    const now = Date.now();
    const rows = body.items.map((i, n) => ({
      ...i,
      id: crypto.randomUUID(),
      // 没有拍摄时间的按上传顺序排，保持选择时的顺序
      takenAt: i.takenAt ?? new Date(now - n),
      createdBy: req.user.sub,
    }));
    await db.insert(g).values(rows);
    if (body.albumId) {
      const [album] = await db.select().from(s.albums).where(eq(s.albums.id, body.albumId));
      if (album) await db.insert(s.albumItems).values(rows.map((r) => ({ albumId: body.albumId!, itemId: r.id })));
    }
    changed(req.user.sub);
    const videos = rows.filter((r) => r.kind === 'video').length;
    notifyPartner(req.user.sub, { title: '{name}', body: `往相册里放了 ${rows.length} ${videos === rows.length ? '个视频' : videos ? '项照片和视频' : '张照片'}`, url: '/gallery', tag: 'gallery', throttleMs: 10 * 60_000 }, (e) => req.log.warn(e, 'web push failed'));
    return db.select().from(g).where(inArray(g.id, rows.map((r) => r.id))).orderBy(desc(g.takenAt));
  });

  // ---- 把动态里的照片 / 视频存进相册（复制一份文件，删动态不会影响相册）
  app.post('/api/gallery/import', auth, async (req) => {
    const body = z.object({ media: z.array(mediaItem).min(1).max(20), takenAt: opt(z.coerce.date()), albumId: z.string().length(36).optional() }).parse(req.body);
    const items = [];
    for (const m of body.media) {
      items.push({
        id: crypto.randomUUID(),
        kind: m.kind,
        image: await copyFile(m.image),
        video: await copyFile(m.video),
        width: m.w ?? null,
        height: m.h ?? null,
        duration: m.duration ?? null,
        takenAt: body.takenAt ?? new Date(),
        createdBy: req.user.sub,
      });
    }
    await db.insert(g).values(items);
    if (body.albumId) await db.insert(s.albumItems).values(items.map((i) => ({ albumId: body.albumId!, itemId: i.id })));
    changed(req.user.sub);
    return { count: items.length };
  });

  // ---- 单张（聊天里的照片卡片、通知点进来、一起看时补拉）
  app.get('/api/gallery/:id', auth, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const [row] = await db.select().from(g).where(eq(g.id, id));
    if (!row) return reply.code(404).send({ message: '这张照片已经删除了' });
    return row;
  });

  app.patch('/api/gallery/:id', auth, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const data = z.object({ favorite: z.boolean().optional(), takenAt: z.coerce.date().optional() }).parse(req.body);
    const [row] = await db.select().from(g).where(eq(g.id, id));
    if (!row) return reply.code(404).send({ message: '不存在' });
    if (Object.keys(data).length) await db.update(g).set(data).where(eq(g.id, id));
    changed(req.user.sub);
    return (await db.select().from(g).where(eq(g.id, id)))[0];
  });

  // ---- 批量操作：删除 / 收藏 / 取消收藏
  app.post('/api/gallery/batch', auth, async (req) => {
    const body = z.object({ ids, action: z.enum(['delete', 'favorite', 'unfavorite']) }).parse(req.body);
    if (body.action === 'delete') {
      const rows = await db.select().from(g).where(inArray(g.id, body.ids));
      await db.delete(g).where(inArray(g.id, body.ids));
      await db.update(s.albums).set({ coverId: null }).where(inArray(s.albums.coverId, body.ids));
      await removeFiles(rows.flatMap((r) => [r.image, r.video]));
      await removeOriginals(rows.map((r) => r.original));
    } else {
      await db.update(g).set({ favorite: body.action === 'favorite' }).where(inArray(g.id, body.ids));
    }
    changed(req.user.sub);
    return { ok: true };
  });

  // ---- 批量下载：先换一个 10 分钟有效的链接，浏览器直接打开就会下载 zip
  app.post('/api/gallery/archive-link', auth, async (req) => {
    const body = z.object({ ids }).parse(req.body);
    // 令牌里不放用户 id：它只能用来下载这一批文件，不能当登录凭证
    const token = app.jwt.sign({ purpose: 'zip', zip: body.ids } as never, { expiresIn: '10m' });
    return { url: `/api/gallery/archive?token=${encodeURIComponent(token)}` };
  });

  app.get('/api/gallery/archive', async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.query);
    let payload: { zip?: string[]; purpose?: string };
    try {
      payload = app.jwt.verify(token);
      if (payload.purpose !== 'zip') throw new Error('wrong purpose');
    } catch {
      return reply.code(401).send({ message: '下载链接已过期，请重新下载' });
    }
    const list = z.array(z.string().length(36)).max(1000).parse(payload.zip ?? []);
    const rows = await db.select().from(g).where(inArray(g.id, list.length ? list : ['-']));
    // 文件可能在本地，也可能已经在对象存储里（并发查，几百张也不用等太久）
    const sources = await mapLimit(rows, 8, (r) => {
      const name = r.original ?? (r.kind === 'video' ? r.video : r.image);
      return name ? fileSource(name, r.original ? 'orig' : 'main') : Promise.resolve(null);
    });
    const files = rows.flatMap((r, i) => (sources[i] ? [{ ...sources[i], name: downloadName(r), date: new Date(r.takenAt) }] : []));
    const names = uniqueNames(files.map((f) => f.name));
    const d = new Date();
    const zipName = `us-相册-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.zip`;
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="us-photos.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(zipStream(files.map((f, i) => ({ ...f, name: names[i] }))));
  });

  // ---- 相册
  app.get('/api/albums', auth, async () => {
    const list = await db.select().from(s.albums).orderBy(desc(s.albums.updatedAt));
    if (!list.length) return [];
    const counts = await db
      .select({ albumId: s.albumItems.albumId, count: sql<number>`count(*)`, last: sql<string>`max(${s.albumItems.addedAt})` })
      .from(s.albumItems)
      .groupBy(s.albumItems.albumId);
    // 每个相册的封面：指定的封面，否则用最新拍摄的一张
    const result = [];
    for (const a of list) {
      const c = counts.find((x) => x.albumId === a.id);
      let cover = a.coverId ? (await db.select().from(g).where(eq(g.id, a.coverId)))[0] : undefined;
      if (!cover && c) {
        cover = (
          await db
            .select({ item: g })
            .from(s.albumItems)
            .innerJoin(g, eq(g.id, s.albumItems.itemId))
            .where(eq(s.albumItems.albumId, a.id))
            .orderBy(desc(g.takenAt))
            .limit(1)
        )[0]?.item;
      }
      result.push({ ...a, count: Number(c?.count ?? 0), cover: cover ?? null });
    }
    return result;
  });

  const albumBody = z.object({
    title: z.string().trim().min(1, '给相册起个名字吧').max(40),
    emoji: opt(z.string().max(16)),
    description: opt(z.string().max(200)),
    coverId: opt(z.string().length(36)),
  });

  app.post('/api/albums', auth, async (req) => {
    const body = albumBody.parse(req.body);
    const id = crypto.randomUUID();
    await db.insert(s.albums).values({ ...body, id, createdBy: req.user.sub });
    changed(req.user.sub, 'albums');
    return (await db.select().from(s.albums).where(eq(s.albums.id, id)))[0];
  });

  app.patch('/api/albums/:id', auth, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = albumBody.partial().parse(req.body);
    const [prev] = await db.select().from(s.albums).where(eq(s.albums.id, id));
    if (!prev) return reply.code(404).send({ message: '不存在' });
    if (Object.keys(body).length) await db.update(s.albums).set(body).where(eq(s.albums.id, id));
    changed(req.user.sub, 'albums');
    return (await db.select().from(s.albums).where(eq(s.albums.id, id)))[0];
  });

  // 删除相册只删相册本身，照片还在「全部照片」里
  app.delete('/api/albums/:id', auth, async (req) => {
    const id = (req.params as { id: string }).id;
    await db.delete(s.albums).where(eq(s.albums.id, id));
    changed(req.user.sub, 'albums');
    return { ok: true };
  });

  app.post('/api/albums/:id/items', auth, async (req, reply) => {
    const albumId = (req.params as { id: string }).id;
    const body = z.object({ ids }).parse(req.body);
    const [album] = await db.select().from(s.albums).where(eq(s.albums.id, albumId));
    if (!album) return reply.code(404).send({ message: '相册不存在' });
    const existing = await db.select({ id: g.id }).from(g).where(inArray(g.id, body.ids));
    const already = new Set(
      (await db.select({ id: s.albumItems.itemId }).from(s.albumItems).where(and(eq(s.albumItems.albumId, albumId), inArray(s.albumItems.itemId, body.ids)))).map((r) => r.id)
    );
    const add = existing.filter((r) => !already.has(r.id));
    if (add.length) await db.insert(s.albumItems).values(add.map((r) => ({ albumId, itemId: r.id })));
    await db.update(s.albums).set({ updatedAt: new Date() }).where(eq(s.albums.id, albumId));
    changed(req.user.sub);
    return { added: add.length };
  });

  app.post('/api/albums/:id/items/remove', auth, async (req) => {
    const albumId = (req.params as { id: string }).id;
    const body = z.object({ ids }).parse(req.body);
    await db.delete(s.albumItems).where(and(eq(s.albumItems.albumId, albumId), inArray(s.albumItems.itemId, body.ids)));
    await db.update(s.albums).set({ coverId: null }).where(and(eq(s.albums.id, albumId), inArray(s.albums.coverId, body.ids)));
    changed(req.user.sub);
    return { ok: true };
  });
}

async function mapLimit<T, R>(list: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]);
      }
    })
  );
  return out;
}
