import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { coupleOf } from './auth.ts';
import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { removeFiles } from './files.ts';
import { broadcast } from './realtime.ts';
import { notifyPartner } from './webPush.ts';

const t = schema.capsules;
type Row = typeof t.$inferSelect;

/** 按你们所在时区算“今天”，避免服务器在 UTC 时提前 / 推迟 8 小时解锁 */
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: env.tz }).format(new Date());

/** 未解锁的胶囊只返回“信封”：标题、谁写的、哪天解锁、多少字、几张照片 */
function present(c: Row) {
  const locked = c.unlockAt > todayStr();
  return {
    id: c.id,
    title: c.title,
    unlockAt: c.unlockAt,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    openedBy: c.openedBy,
    locked,
    letterLength: c.content.length,
    photoCount: c.photos.length,
    content: locked ? null : c.content,
    photos: locked ? [] : c.photos,
  };
}

export async function capsuleRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.paired };
  const find = async (coupleId: string, id: string) => (await db.select().from(t).where(and(eq(t.coupleId, coupleId), eq(t.id, id))).limit(1))[0];

  app.get('/api/capsules', auth, async (req) => {
    const rows = await db.select().from(t).where(eq(t.coupleId, coupleOf(req))).orderBy(asc(t.unlockAt));
    return rows.map(present);
  });

  app.get('/api/capsules/:id', auth, async (req, reply) => {
    const c = await find(coupleOf(req), (req.params as { id: string }).id);
    return c ? present(c) : reply.code(404).send({ message: '不存在' });
  });

  app.post('/api/capsules', auth, async (req, reply) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(40),
        content: z.string().trim().min(1).max(10000),
        photos: z.array(z.string().max(100)).max(9).default([]),
        unlockAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);
    if (body.unlockAt <= todayStr()) return reply.code(400).send({ message: '解锁日期要在今天之后' });
    const id = crypto.randomUUID();
    const coupleId = coupleOf(req);
    await db.insert(t).values({ ...body, id, coupleId, createdBy: req.user.sub });
    broadcast(coupleId, { type: 'change', collection: 'capsules', id, by: req.user.sub });
    notifyPartner(req.user.sub, { title: '{name}', body: `埋下了一颗时光胶囊，${body.unlockAt} 才能打开 ⏳`, url: '/capsules', tag: 'capsule' }, (e) => req.log.warn(e, 'web push failed'));
    return present((await find(coupleId, id))!);
  });

  /** 记录“我打开过了”，只有解锁后才允许 */
  app.post('/api/capsules/:id/open', auth, async (req, reply) => {
    const coupleId = coupleOf(req);
    const c = await find(coupleId, (req.params as { id: string }).id);
    if (!c) return reply.code(404).send({ message: '不存在' });
    if (c.unlockAt > todayStr()) return reply.code(403).send({ message: '还没到打开的日子' });
    if (!c.openedBy.includes(req.user.sub)) {
      await db.update(t).set({ openedBy: [...c.openedBy, req.user.sub] }).where(eq(t.id, c.id));
      broadcast(coupleId, { type: 'change', collection: 'capsules', id: c.id, by: req.user.sub });
    }
    return present((await find(coupleId, c.id))!);
  });

  /** 封存后不能修改，只有作者能删除 */
  app.delete('/api/capsules/:id', auth, async (req, reply) => {
    const coupleId = coupleOf(req);
    const c = await find(coupleId, (req.params as { id: string }).id);
    if (!c) return { ok: true };
    if (c.createdBy !== req.user.sub) return reply.code(403).send({ message: '只能删除自己写的胶囊' });
    await db.delete(t).where(eq(t.id, c.id));
    await removeFiles(c.photos);
    broadcast(coupleId, { type: 'change', collection: 'capsules', id: c.id, by: req.user.sub });
    return { ok: true };
  });
}
