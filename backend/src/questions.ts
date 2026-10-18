import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db, schema } from './db/index.ts';
import { mustAnswer, visibleQuestionAnswers } from './questionPrivacy.ts';
import { broadcast } from './realtime.ts';
import { notifyPartner, snippet } from './webPush.ts';

const q = schema.questions;
const a = schema.questionAnswers;
type Row = typeof q.$inferSelect;

/** 问答：两个人互相提问，往期都保留 */
export async function questionRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  const present = async (rows: Row[], userId: string) => {
    if (!rows.length) return [];
    const answers = await db.select().from(a).where(inArray(a.questionId, rows.map((r) => r.id)));
    return rows.map((r) => ({ ...r, answers: visibleQuestionAnswers(r, answers, userId) }));
  };
  const find = async (id: string) => (await db.select().from(q).where(eq(q.id, id)).limit(1))[0];
  const idParam = (req: { params: unknown }) => z.object({ id: z.string().uuid() }).parse(req.params).id;

  app.get('/api/questions', auth, async (req) => {
    return present(await db.select().from(q).orderBy(desc(q.createdAt)).limit(500), req.user.sub);
  });

  app.get('/api/questions/:id', auth, async (req, reply) => {
    const row = await find(idParam(req));
    if (!row) return reply.code(404).send({ message: '这个问题不见了' });
    return (await present([row], req.user.sub))[0];
  });

  app.post('/api/questions', auth, async (req) => {
    const body = z.object({ text: z.string().trim().min(1).max(200), askerAnswers: z.boolean().default(true) }).parse(req.body);
    const id = crypto.randomUUID();
    await db.insert(q).values({ id, ...body, createdBy: req.user.sub });
    broadcast({ type: 'change', collection: 'questions', id, by: req.user.sub });
    notifyPartner(req.user.sub, { title: '{name}', body: `问了你一个问题：「${snippet(body.text, 40)}」💌`, url: `/question?id=${id}`, tag: `question-${id}` }, (e) => req.log.warn(e, 'web push failed'));
    return (await present([(await find(id))!], req.user.sub))[0];
  });

  app.put('/api/questions/:id/answer', auth, async (req, reply) => {
    const id = idParam(req);
    const { content } = z.object({ content: z.string().trim().min(1).max(1000) }).parse(req.body);
    const row = await find(id);
    if (!row) return reply.code(404).send({ message: '这个问题不见了' });
    if (!mustAnswer(row, req.user.sub)) return reply.code(400).send({ message: '这个问题只需要 TA 回答' });
    const [answered] = await db.select({ id: a.id }).from(a).where(and(eq(a.questionId, id), eq(a.createdBy, req.user.sub))).limit(1);
    await db.insert(a).values({ questionId: id, content, createdBy: req.user.sub }).onDuplicateKeyUpdate({ set: { content } });
    broadcast({ type: 'change', collection: 'questions', id, by: req.user.sub });
    if (!answered) {
      const partnerId = row.createdBy === req.user.sub ? null : row.createdBy;
      // 对方还要答、还没答：提醒 TA 来答；否则告诉 TA 可以看了
      const others = await db.select({ by: a.createdBy }).from(a).where(eq(a.questionId, id));
      const partnerDone = others.some((o) => o.by !== req.user.sub);
      const partnerMust = partnerId ? mustAnswer(row, partnerId) : true;
      const text = snippet(row.text, 30);
      const body = partnerDone || !partnerMust ? `回答了「${text}」，去看看吧 👀` : `回答了「${text}」，你也答一下就能看到 TA 的答案 💌`;
      notifyPartner(req.user.sub, { title: '{name}', body, url: `/question?id=${id}`, tag: `question-${id}` }, (e) => req.log.warn(e, 'web push failed'));
    }
    return (await present([(await find(id))!], req.user.sub))[0];
  });

  app.delete('/api/questions/:id', auth, async (req, reply) => {
    const id = idParam(req);
    const row = await find(id);
    if (!row) return { ok: true };
    if (row.createdBy !== req.user.sub) return reply.code(403).send({ message: '只有提问的人可以删除' });
    await db.delete(q).where(eq(q.id, id));
    broadcast({ type: 'change', collection: 'questions', id, by: req.user.sub });
    return { ok: true };
  });
}
