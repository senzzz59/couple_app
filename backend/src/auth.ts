import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { removeFiles } from './files.ts';
import { partnerOf } from './couple.ts';
import { broadcast, isOnline, sendTo, setShareViewing } from './realtime.ts';
import { pushNudge } from './push.ts';
import { sendWebPush } from './webPush.ts';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 登录并且已经配对：共享数据的接口都用这个 */
    paired: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** 登录的人属于哪一对（authenticate 之后才有；没配对时为 null） */
    coupleId: string | null;
  }
}

/** 已配对接口里取当前情侣 id（paired 已经保证有值） */
export function coupleOf(req: FastifyRequest): string {
  if (!req.coupleId) throw Object.assign(new Error('还没有和 TA 配对'), { statusCode: 403 });
  return req.coupleId;
}

export const publicUser = ({ passwordHash: _, ...u }: typeof schema.users.$inferSelect) => u;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// 登录失败限流：每个 IP 15 分钟内最多 10 次失败
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60 * 1000;

/** 在根实例上直接调用（不能放进 register 的插件里，否则装饰器不会共享） */
export function decorateAuth(app: FastifyInstance) {
  app.decorateRequest('coupleId', null);
  const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      if (!req.user?.sub) throw new Error('not a session token');
      const [u] = await db.select({ id: schema.users.id, coupleId: schema.users.coupleId }).from(schema.users).where(eq(schema.users.id, req.user.sub));
      if (!u) throw new Error('user gone');
      req.coupleId = u.coupleId;
      return true;
    } catch {
      reply.code(401).send({ message: '请重新登录' });
      return false;
    }
  };
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply);
  });
  app.decorate('paired', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authenticate(req, reply))) return;
    if (!req.coupleId) reply.code(403).send({ message: '还没有和 TA 配对', code: 'NOT_PAIRED' });
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const ip = req.ip;
    const f = failures.get(ip);
    if (f && f.count >= 10 && f.until > Date.now()) return reply.code(429).send({ message: '尝试次数太多，请 15 分钟后再试' });

    const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, body.email));
    const ok = user && (await bcrypt.compare(body.password, user.passwordHash));
    if (!ok) {
      const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW };
      failures.set(ip, { count: cur.count + 1, until: cur.until });
      return reply.code(400).send({ message: '邮箱或密码不对' });
    }
    failures.delete(ip);
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: env.tokenTtl });
    return { token, user: publicUser(user) };
  });

  const auth = { preHandler: app.authenticate };

  /** 自己 + 另一半（还没配对时 partner 为 null，me.coupleId 也为 null） */
  app.get('/api/me', auth, async (req) => {
    const [me] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.sub));
    const partner = await partnerOf(me.id, me.coupleId);
    return { me: publicUser(me), partner: partner && publicUser(partner) };
  });

  app.patch('/api/me', auth, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        avatar: z.string().max(100).nullable(),
        gender: z.enum(['male', 'female']).nullable(),
        birthday: dateStr.nullable(),
        birthdayLunar: z.boolean(),
        mood: z.string().max(16).nullable(),
        moodText: z.string().max(60).nullable(),
        shareViewing: z.boolean(),
        password: z.string().min(8).max(100),
      })
      .partial()
      .parse(req.body);
    const { password, ...rest } = body;
    const patch: Partial<typeof schema.users.$inferInsert> = { ...rest };
    if (password) patch.passwordHash = await bcrypt.hash(password, 10);
    if ('mood' in body || 'moodText' in body) patch.moodAt = new Date();
    if ('avatar' in body) {
      const [old] = await db.select({ avatar: schema.users.avatar }).from(schema.users).where(eq(schema.users.id, req.user.sub));
      if (old?.avatar && old.avatar !== body.avatar) await removeFiles([old.avatar]);
    }
    if (Object.keys(patch).length) await db.update(schema.users).set(patch).where(eq(schema.users.id, req.user.sub));
    if (body.shareViewing !== undefined) setShareViewing(req.user.sub, body.shareViewing);
    broadcast(req.coupleId, { type: 'change', collection: 'users', id: req.user.sub, by: req.user.sub });
    const [me] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.sub));
    return publicUser(me);
  });

  const NUDGE_TEXT = { miss: '想你了 💗', hug: '要抱抱 🫂', kiss: '亲你一下 😘', hungry: '饿了，一起吃饭吗 🍜', poke: '戳了你一下 👉' } as const;

  /** 戳一戳：只推给另一半 */
  app.post('/api/nudges', { preHandler: app.paired }, async (req) => {
    const { kind } = z.object({ kind: z.enum(['miss', 'hug', 'kiss', 'hungry', 'poke']) }).parse(req.body);
    const partner = await partnerOf(req.user.sub, req.coupleId);
    if (!partner) return { ok: false };
    const id = crypto.randomUUID();
    const event = { id, kind, from: req.user.sub, at: new Date().toISOString() };
    await db.insert(schema.nudges).values({ id, fromId: req.user.sub, toId: partner.id, kind });
    const [sender] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, req.user.sub));
    const offline = !isOnline(partner.id);
    const log = (e: unknown) => req.log.warn(e, 'push delivery failed');
    const [nativePush, webPush] = offline
      ? await Promise.all([
        pushNudge(partner.id, sender?.name ?? 'TA', event, log).catch((e) => { log(e); return false; }),
        sendWebPush(partner.id, { title: sender?.name || 'TA', body: NUDGE_TEXT[kind], url: '/', tag: 'nudge' }, log).catch((e) => { log(e); return false; }),
      ])
      : [false, false];
    const remotePush = nativePush || webPush;
    sendTo(partner.id, { type: 'nudge', ...event, remotePush });
    return { ok: true };
  });
}
