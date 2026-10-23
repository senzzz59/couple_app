import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { z } from 'zod';
import { db, schema } from './db/index.ts';
import { partnerOf } from './couple.ts';
import { isOnline } from './realtime.ts';

/**
 * 网页推送（添加到主屏幕后的 iPhone / 安卓 / 电脑）。
 * VAPID 密钥第一次用到时自动生成并存进数据库，不需要手动配置；
 * 也可以在 .env 里用 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 指定。
 */
type Keys = { publicKey: string; privateKey: string };
let keys: Promise<Keys> | null = null;

async function loadKeys(): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const read = async () => {
    const [row] = await db.select().from(schema.appSecrets).where(eq(schema.appSecrets.name, 'vapid'));
    return row ? (JSON.parse(row.value) as Keys) : null;
  };
  const saved = await read();
  if (saved) return saved;
  const generated = webpush.generateVAPIDKeys();
  // 两个进程同时生成时，以先写进去的为准
  await db.insert(schema.appSecrets).values({ name: 'vapid', value: JSON.stringify(generated) }).onDuplicateKeyUpdate({ set: { name: 'vapid' } });
  return (await read()) ?? generated;
}

export function vapidKeys() {
  keys ??= loadKeys().catch((error) => {
    keys = null;
    throw error;
  });
  return keys;
}

/**
 * VAPID 的联系方式。苹果推送服务要求是真实的 https 网址或邮箱，
 * 默认用网站自己的地址（从请求里得到），也可以用 VAPID_SUBJECT 指定。
 */
let siteOrigin: string | null = null;
function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (siteOrigin) return siteOrigin;
  const mail = process.env.SMTP_USER;
  return mail && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail) && !mail.endsWith('@example.com') ? `mailto:${mail}` : 'mailto:noreply@senfoundry.com';
}

const subscriptionBody = z.object({
  endpoint: z.string().url().max(2000).startsWith('https://'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const endpointBody = z.object({ endpoint: z.string().max(2000) });
const idOf = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export type PushMessage = {
  title: string;
  body: string;
  /** 点通知后打开的页面 */
  url?: string;
  /** 同一个 tag 的通知会合并成一条（例如连续上传很多照片） */
  tag?: string;
};

/** 发给某个人的所有设备。失效的订阅（410 / 404）顺手删掉。返回是否至少送达一台 */
export async function sendWebPush(userId: string, message: PushMessage, log: (error: unknown) => void) {
  const subs = await db.select().from(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.userId, userId));
  if (!subs.length) return false;
  const { publicKey, privateKey } = await vapidKeys();
  const subject = vapidSubject();
  const payload = JSON.stringify({ ...message, url: message.url ?? '/' });
  const results = await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: 24 * 3600,
        urgency: 'high',
        vapidDetails: { subject, publicKey, privateKey },
        timeout: 10_000,
        ...(message.tag ? { topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined } : {}),
      });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.id, sub.id)).catch(log);
      else log(error);
      return false;
    }
  }));
  return results.some(Boolean);
}

/** 同一种通知短时间内只发一次（例如一口气传了 30 张照片） */
const recent = new Map<string, number>();
function throttled(key: string, ms: number) {
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > 3600_000) recent.delete(k);
  const last = recent.get(key);
  if (last && now - last < ms) return true;
  recent.set(key, now);
  return false;
}

/**
 * 有新动态、评论等时提醒另一半。对方正开着 App（前台实时连接）时不推送，页面会实时刷新。
 * body 里可以用 {name} 代表发送人的昵称。推送失败不影响原来的操作。
 */
export function notifyPartner(fromUserId: string, message: PushMessage & { throttleMs?: number }, log: (error: unknown) => void) {
  void (async () => {
    const [sender] = await db.select({ name: schema.users.name, coupleId: schema.users.coupleId }).from(schema.users).where(eq(schema.users.id, fromUserId));
    const partner = sender ? await partnerOf(fromUserId, sender.coupleId) : null;
    if (!partner || isOnline(partner.id)) return;
    if (message.throttleMs && throttled(`${fromUserId}:${message.tag}`, message.throttleMs)) return;
    const name = sender?.name || 'TA';
    await sendWebPush(partner.id, { ...message, title: message.title.replace('{name}', name), body: message.body.replace('{name}', name) }, log);
  })().catch(log);
}

/** 截一小段文字放进通知里 */
export const snippet = (text: unknown, max = 40) => {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export async function webPushRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  app.addHook('onRequest', async (req) => {
    if (siteOrigin) return;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    const proto = req.headers['x-forwarded-proto'];
    if (typeof host === 'string' && proto === 'https' && /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(host)) siteOrigin = `https://${host.split(':')[0]}`;
  });
  app.get('/api/web-push/key', auth, async () => ({ publicKey: (await vapidKeys()).publicKey }));

  app.put('/api/web-push/subscription', auth, async (req) => {
    const body = subscriptionBody.parse(req.body);
    const row = { userId: req.user.sub, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth };
    await db.insert(schema.webPushSubscriptions).values({ id: idOf(body.endpoint), ...row }).onDuplicateKeyUpdate({ set: row });
    return { ok: true };
  });

  app.delete('/api/web-push/subscription', auth, async (req) => {
    const { endpoint } = endpointBody.parse(req.body);
    await db.delete(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.id, idOf(endpoint)));
    return { ok: true };
  });

  /** 设置里的「发一条测试通知」：发给自己 */
  app.post('/api/web-push/test', auth, async (req) => {
    const ok = await sendWebPush(req.user.sub, { title: 'us.', body: '通知已开启，TA 发动态、评论、戳你时都会提醒你 💗', url: '/settings', tag: 'test' }, (e) => req.log.warn(e, 'web push test failed'));
    return { ok };
  });
}
