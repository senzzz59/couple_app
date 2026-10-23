import bcrypt from 'bcryptjs';
import { and, count, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

import { coupleOf } from './auth.ts';
import { db, schema } from './db/index.ts';
import { removeFiles, removeOriginals } from './files.ts';
import { collectReferences } from './orphans.ts';
import { broadcast, moveUser } from './realtime.ts';

const s = schema;
const c = s.couples;

/** 邀请码：去掉容易看错的 0/O、1/I/L */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 8;
export const newInviteCode = () => Array.from({ length: INVITE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const password = z.object({ password: z.string().min(1, '请输入密码') });

/** 同一对里的另一半（还没配对或 TA 还没加入时为 null） */
export async function partnerOf(userId: string, coupleId: string | null) {
  if (!coupleId) return null;
  const [p] = await db.select().from(s.users).where(and(eq(s.users.coupleId, coupleId), ne(s.users.id, userId))).limit(1);
  return p ?? null;
}

const memberCount = async (coupleId: string) => (await db.select({ n: count() }).from(s.users).where(eq(s.users.coupleId, coupleId)))[0].n;

/** 删除整个空间：先列出文件，删掉数据（外键级联），再删文件 */
export async function deleteCouple(coupleId: string) {
  const refs = await collectReferences(coupleId);
  await db.delete(c).where(eq(c.id, coupleId));
  await removeFiles([...refs.files]);
  await removeOriginals([...refs.originals]);
}

/**
 * 离开现在的空间。另一半还在：数据留给 TA，并重新生成邀请码让 TA 可以再邀请；
 * 只剩自己：整个空间连同照片一起删除。
 */
export async function leaveCouple(userId: string) {
  const [me] = await db.select({ coupleId: s.users.coupleId }).from(s.users).where(eq(s.users.id, userId));
  const coupleId = me?.coupleId;
  if (!coupleId) return;
  await db.update(s.users).set({ coupleId: null }).where(eq(s.users.id, userId));
  await db.delete(s.chatReads).where(eq(s.chatReads.userId, userId));
  moveUser(userId, null);
  if ((await memberCount(coupleId)) === 0) {
    await deleteCouple(coupleId);
  } else {
    await db.update(c).set({ inviteCode: newInviteCode() }).where(eq(c.id, coupleId));
    broadcast(coupleId, { type: 'change', collection: 'users', id: userId, by: userId });
    broadcast(coupleId, { type: 'change', collection: 'couple', by: userId });
  }
}

async function checkPassword(userId: string, input: string) {
  const [u] = await db.select({ hash: s.users.passwordHash }).from(s.users).where(eq(s.users.id, userId));
  return !!u && (await bcrypt.compare(input, u.hash));
}

// 填邀请码失败限流：每个账号 15 分钟内最多 10 次
const joinFailures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60 * 1000;

export async function coupleRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const paired = { preHandler: app.paired };

  const present = async (coupleId: string | null) => {
    if (!coupleId) return null;
    const [row] = await db.select().from(c).where(eq(c.id, coupleId));
    if (!row) return null;
    const members = await memberCount(coupleId);
    // 已经两个人了就不再显示邀请码
    return { id: row.id, inviteCode: members < 2 ? row.inviteCode : null, startDate: row.startDate, title: row.title, members };
  };

  app.get('/api/couple', auth, async (req) => ({ couple: await present(req.coupleId) }));

  /** 先来的人建空间，拿到邀请码 */
  app.post('/api/couple', auth, async (req, reply) => {
    if (req.coupleId) return reply.code(409).send({ message: '你已经在一个空间里了' });
    const id = crypto.randomUUID();
    await db.insert(c).values({ id, inviteCode: newInviteCode() });
    await db.update(s.users).set({ coupleId: id }).where(eq(s.users.id, req.user.sub));
    moveUser(req.user.sub, id);
    return { couple: await present(id) };
  });

  /** 填另一半的邀请码加入。自己已经建了空间（还没人加入）时，要确认放弃它（里面的内容会删除） */
  app.post('/api/couple/join', auth, async (req, reply) => {
    const body = z.object({ code: z.string().max(20), leaveCurrent: z.boolean().optional() }).parse(req.body);
    const me = req.user.sub;
    const f = joinFailures.get(me);
    if (f && f.count >= 10 && f.until > Date.now()) return reply.code(429).send({ message: '试了太多次，请 15 分钟后再试' });
    const fail = (status: number, message: string) => {
      const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW };
      joinFailures.set(me, { count: cur.count + 1, until: cur.until });
      return reply.code(status).send({ message });
    };
    const code = normalizeInviteCode(body.code);
    if (code.length !== INVITE_LENGTH) return fail(400, `邀请码是 ${INVITE_LENGTH} 位字母和数字`);
    const [target] = await db.select({ id: c.id }).from(c).where(eq(c.inviteCode, code));
    if (!target) return fail(404, '邀请码不对，或者已经失效了');
    if (target.id === req.coupleId) return reply.code(400).send({ message: '这是你自己的邀请码，发给 TA 来填吧' });
    if (req.coupleId) {
      if ((await memberCount(req.coupleId)) > 1) return reply.code(409).send({ message: '你已经和 TA 配对了，要先解除关系才能加入别的空间' });
      if (!body.leaveCurrent) return reply.code(409).send({ message: '加入后，你现在空间里的内容会被删除', code: 'LEAVE_CURRENT' });
    }

    // 两个人同时用一个邀请码时只让一个人进来
    const joined = await db.transaction(async (tx) => {
      const [row] = await tx.select({ id: c.id, inviteCode: c.inviteCode }).from(c).where(eq(c.id, target.id)).for('update');
      if (!row || row.inviteCode !== code) return false;
      const [{ n }] = await tx.select({ n: count() }).from(s.users).where(eq(s.users.coupleId, row.id));
      if (n >= 2) return false;
      await tx.update(c).set({ inviteCode: null }).where(eq(c.id, row.id));
      return true;
    });
    if (!joined) return fail(410, '这个邀请码已经被用掉了');
    joinFailures.delete(me);
    if (req.coupleId) await leaveCouple(me);
    await db.update(s.users).set({ coupleId: target.id }).where(eq(s.users.id, me));
    // 加入之前的聊天不算未读
    const now = new Date();
    await db.insert(s.chatReads).values({ userId: me, readAt: now }).onDuplicateKeyUpdate({ set: { readAt: now } });
    moveUser(me, target.id);
    broadcast(target.id, { type: 'change', collection: 'users', id: me, by: me });
    broadcast(target.id, { type: 'change', collection: 'couple', by: me });
    return { couple: await present(target.id) };
  });

  /** 换一个邀请码（旧的立刻失效） */
  app.post('/api/couple/invite', paired, async (req, reply) => {
    const coupleId = coupleOf(req);
    if ((await memberCount(coupleId)) > 1) return reply.code(409).send({ message: '已经配对了，不需要邀请码' });
    await db.update(c).set({ inviteCode: newInviteCode() }).where(eq(c.id, coupleId));
    return { couple: await present(coupleId) };
  });

  /** 解除关系：要输入密码确认 */
  app.post('/api/couple/leave', paired, async (req, reply) => {
    const body = password.parse(req.body);
    if (!(await checkPassword(req.user.sub, body.password))) return reply.code(400).send({ message: '密码不对' });
    await leaveCouple(req.user.sub);
    return { ok: true };
  });

  /** 在一起的日子、空间名字（两个人共用） */
  app.get('/api/space', paired, async (req) => {
    const coupleId = coupleOf(req);
    const [row] = await db.select().from(c).where(eq(c.id, coupleId));
    return { id: coupleId, startDate: row?.startDate ?? null, title: row?.title ?? null };
  });

  app.patch('/api/space', paired, async (req) => {
    const coupleId = coupleOf(req);
    const body = z.object({ startDate: dateStr.nullable(), title: z.string().max(40).nullable() }).partial().parse(req.body);
    if (Object.keys(body).length) await db.update(c).set(body).where(eq(c.id, coupleId));
    broadcast(coupleId, { type: 'change', collection: 'space', by: req.user.sub });
    const [row] = await db.select().from(c).where(eq(c.id, coupleId));
    return { id: coupleId, startDate: row.startDate, title: row.title };
  });

  /** 注销账号：离开空间（规则同解除关系），删除自己的账号和头像 */
  app.post('/api/account/delete', auth, async (req, reply) => {
    const body = password.parse(req.body);
    const me = req.user.sub;
    if (!(await checkPassword(me, body.password))) return reply.code(400).send({ message: '密码不对' });
    await leaveCouple(me);
    const [u] = await db.select().from(s.users).where(eq(s.users.id, me));
    if (!u) return { ok: true };
    await db.delete(s.emailCodes).where(eq(s.emailCodes.email, u.email));
    // 推送订阅、口味偏好随账号级联删除
    await db.delete(s.users).where(eq(s.users.id, me));
    await removeFiles([u.avatar]);
    return { ok: true };
  });
}
