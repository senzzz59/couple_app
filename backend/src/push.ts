import { and, eq, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from './db/index.ts';

const tokenBody = z.object({ token: z.string().max(191).regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/) });
const pushHeaders = () => ({ 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) });

async function checkReceipts(log: (error: unknown) => void) {
  const receipts = await db.select().from(schema.pushReceipts).where(lt(schema.pushReceipts.createdAt, new Date(Date.now() - 15 * 60_000))).limit(100);
  if (!receipts.length) return;
  const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST', headers: pushHeaders(), body: JSON.stringify({ ids: receipts.map((r) => r.id) }), signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Push receipts returned ${res.status}`);
  const { data } = await res.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
  if (!data) throw new Error('Invalid push receipts response');
  const completed: string[] = [];
  for (const receipt of receipts) {
    const result = data[receipt.id];
    if (result) {
      if (result.details?.error === 'DeviceNotRegistered') await db.delete(schema.pushTokens).where(eq(schema.pushTokens.token, receipt.token));
      if (result.status === 'error') log(result.details?.error ?? 'Push delivery failed');
      completed.push(receipt.id);
    } else if (receipt.createdAt.getTime() < Date.now() - 24 * 3600_000) {
      log('Push receipt expired without confirmation');
      completed.push(receipt.id);
    }
  }
  if (completed.length) await db.delete(schema.pushReceipts).where(inArray(schema.pushReceipts.id, completed));
}

export async function pushRoutes(app: FastifyInstance) {
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try { await checkReceipts((e) => app.log.warn(e, 'push receipt error')); }
    catch (e) { app.log.warn(e, 'push receipts unavailable'); }
    finally { checking = false; }
  };
  const timer = setInterval(() => void check(), 60_000);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
  void check();
  const auth = { preHandler: app.authenticate };
  app.put('/api/push-token', auth, async (req) => {
    const { token } = tokenBody.parse(req.body);
    await db.insert(schema.pushTokens).values({ token, userId: req.user.sub }).onDuplicateKeyUpdate({ set: { userId: req.user.sub } });
    return { ok: true };
  });
  app.delete('/api/push-token', auth, async (req) => {
    const { token } = tokenBody.parse(req.body);
    await db.delete(schema.pushTokens).where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, req.user.sub)));
    return { ok: true };
  });
}

/** Expo manages APNs / FCM delivery. Errors must not fail the nudge itself. */
export async function pushNudge(userId: string, name: string, event: { id: string; kind: string; from: string; at: string }, log: (error: unknown) => void) {
  const labels: Record<string, string> = { miss: '想你了 💗', hug: '要抱抱 🫂', kiss: '亲你一下 😘', hungry: '饿了，一起吃饭吗 🍜', poke: '戳了你一下 👉' };
  const devices = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
  if (!devices.length) return false;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: pushHeaders(),
      body: JSON.stringify(devices.map(({ token }) => ({ to: token, title: name, body: labels[event.kind], sound: 'default', channelId: 'default', data: { type: 'nudge', ...event, remotePush: true } }))),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Push service returned ${res.status}`);
    const result = await res.json() as { data?: { id?: string; status: string; details?: { error?: string } }[] };
    if (!Array.isArray(result.data) || result.data.length !== devices.length) throw new Error('Invalid push response');
    for (const [i, ticket] of result.data.entries()) {
      if (ticket.details?.error === 'DeviceNotRegistered') await db.delete(schema.pushTokens).where(eq(schema.pushTokens.token, devices[i].token)).catch(log);
      if (ticket.status === 'error') log(ticket.details?.error ?? 'Push rejected');
      if (ticket.status === 'ok' && ticket.id) {
        await db.insert(schema.pushReceipts).values({ id: ticket.id, token: devices[i].token }).onDuplicateKeyUpdate({ set: { token: devices[i].token } }).catch(log);
      }
    }
    return result.data.some((ticket) => ticket.status === 'ok');
  } catch (error) {
    log(error);
    return false;
  }
}
