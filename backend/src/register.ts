import bcrypt from 'bcryptjs';
import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

import { publicUser } from './auth.ts';
import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { sendCodeMail, smtpConfigured } from './mail.ts';
import { broadcast } from './realtime.ts';

const t = schema.emailCodes;
const CODE_TTL = 10 * 60 * 1000;
const RESEND_GAP = 60 * 1000;
const MAX_ATTEMPTS = 5;

const email = z.string().trim().toLowerCase().email('邮箱格式不对').max(191);
const password = z.string().min(8, '密码至少 8 位').max(100);
const purpose = z.enum(['register', 'reset']);
const hash = (code: string, mail: string) => createHash('sha256').update(`${code}:${mail}:${env.jwtSecret}`).digest('hex');

// 每个 IP 每小时最多发 10 封
const ipSends = new Map<string, number[]>();

const userCount = async () => (await db.select({ n: count() }).from(schema.users))[0].n;
const findUser = async (mail: string) => (await db.select().from(schema.users).where(eq(schema.users.email, mail)))[0];

/** 校验验证码：成功后删除，失败累计次数 */
async function verify(mail: string, p: 'register' | 'reset', code: string) {
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.email, mail), eq(t.purpose, p)))
    .orderBy(desc(t.createdAt))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return '验证码已过期，请重新获取';
  if (row.attempts >= MAX_ATTEMPTS) return '错误次数太多，请重新获取验证码';
  if (row.codeHash !== hash(code.trim(), mail)) {
    await db.update(t).set({ attempts: row.attempts + 1 }).where(eq(t.id, row.id));
    return '验证码不对';
  }
  await db.delete(t).where(and(eq(t.email, mail), eq(t.purpose, p)));
  return null;
}

export async function registerRoutes(app: FastifyInstance) {
  const sign = (id: string) => app.jwt.sign({ sub: id }, { expiresIn: env.tokenTtl });

  /** 登录页用：还能不能注册 */
  app.get('/api/auth/status', async () => {
    const n = await userCount();
    return { registrationOpen: n < env.maxUsers, users: n, maxUsers: env.maxUsers, mail: smtpConfigured() };
  });

  app.post('/api/auth/send-code', async (req, reply) => {
    const body = z.object({ email, purpose }).parse(req.body);

    const now = Date.now();
    const sends = (ipSends.get(req.ip) ?? []).filter((x) => now - x < 3600_000);
    if (sends.length >= 10) return reply.code(429).send({ message: '发送太频繁，请一小时后再试' });

    const user = await findUser(body.email);
    if (body.purpose === 'register') {
      if (user) return reply.code(409).send({ message: '这个邮箱已经注册过了，直接登录吧' });
      if ((await userCount()) >= env.maxUsers) return reply.code(403).send({ message: '注册名额已满（这个空间只属于两个人）' });
    } else if (!user) {
      return reply.code(404).send({ message: '这个邮箱还没有注册' });
    }

    const [last] = await db
      .select()
      .from(t)
      .where(and(eq(t.email, body.email), eq(t.purpose, body.purpose)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    if (last && now - last.createdAt.getTime() < RESEND_GAP) {
      return reply.code(429).send({ message: `请 ${Math.ceil((RESEND_GAP - (now - last.createdAt.getTime())) / 1000)} 秒后再试` });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.insert(t).values({ email: body.email, purpose: body.purpose, codeHash: hash(code, body.email), expiresAt: new Date(now + CODE_TTL) });
    try {
      await sendCodeMail(body.email, code, body.purpose, (m) => req.log.warn(m));
    } catch (e) {
      req.log.error(e, 'send mail failed');
      return reply.code(502).send({ message: '邮件发送失败，检查一下服务器的 SMTP 配置' });
    }
    ipSends.set(req.ip, [...sends, now]);
    return { ok: true, resendAfter: RESEND_GAP / 1000 };
  });

  app.post('/api/auth/register', async (req, reply) => {
    const body = z.object({ email, code: z.string().length(6), password, name: z.string().trim().min(1, '起个昵称吧').max(40) }).parse(req.body);
    if (await findUser(body.email)) return reply.code(409).send({ message: '这个邮箱已经注册过了' });
    if ((await userCount()) >= env.maxUsers) return reply.code(403).send({ message: '注册名额已满' });
    const err = await verify(body.email, 'register', body.code);
    if (err) return reply.code(400).send({ message: err });

    const id = crypto.randomUUID();
    await db.insert(schema.users).values({ id, email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) });
    broadcast({ type: 'change', collection: 'users', id, by: id });
    const user = (await findUser(body.email))!;
    return { token: sign(id), user: publicUser(user) };
  });

  app.post('/api/auth/reset', async (req, reply) => {
    const body = z.object({ email, code: z.string().length(6), password }).parse(req.body);
    const user = await findUser(body.email);
    if (!user) return reply.code(404).send({ message: '这个邮箱还没有注册' });
    const err = await verify(body.email, 'reset', body.code);
    if (err) return reply.code(400).send({ message: err });
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash(body.password, 10) }).where(eq(schema.users.id, user.id));
    return { token: sign(user.id), user: publicUser(user) };
  });
}
