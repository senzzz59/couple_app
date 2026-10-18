import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { db, schema } from './db/index.ts';

/**
 * 实时通道：
 * - 数据变化广播 { type: 'change', collection }，客户端收到后重新拉取对应列表。两个人的数据量很小，这样最稳。
 * - 相册里「TA 在看哪张」「一起看」「快速回应」：只在内存里转发给另一半，不存库。
 */
type Socket = { readyState: number; send: (msg: string) => void };
type Where = 'grid' | 'viewer' | null;
type SocketInfo = {
  userId: string;
  active: boolean;
  where: Where;
  itemId: string | null;
  lookAt: number;
  /** 限速：1 秒内收到的消息数 */
  windowStart: number;
  count: number;
};

export type PeerState = { online: boolean; where: Where; itemId: string | null };

export type RealtimeEvent =
  | { type: 'change'; collection: string; id?: string; by?: string }
  | { type: 'nudge'; id: string; kind: string; from: string; at: string; remotePush?: boolean }
  | { type: 'chat'; message: { id: string } & Record<string, unknown> }
  | { type: 'show'; id: string; from: string; itemId: string; at: string }
  | ({ type: 'peer' } & PeerState)
  | { type: 'react'; from: string; itemId: string; emoji?: string; text?: string; at: string }
  | { type: 'coview'; from: string; action: CoviewAction; itemId?: string; at: string };

/** 一起看：邀请 / 加入 / 退出；goto = 我翻到了这张，对方跟过来 */
export type CoviewAction = 'invite' | 'join' | 'leave' | 'goto';
const COVIEW_ACTIONS: CoviewAction[] = ['invite', 'join', 'leave', 'goto'];

export const REACTION_EMOJIS = ['💗', '😂', '😍', '👀', '👍', '🥺', '😮', '🔥'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RATE_LIMIT = 15;

const sockets = new Map<Socket, SocketInfo>();
/** 是否让另一半看到自己在看哪张（users.share_viewing），连接时读一次，设置改了会更新 */
const shareViewing = new Map<string, boolean>();
let lastSent = new Map<string, string>();

const open = (ws: Socket) => ws.readyState === 1;

export const isOnline = (userId: string) => [...sockets].some(([ws, s]) => s.userId === userId && open(ws) && s.active);

function send(ws: Socket, event: RealtimeEvent) {
  if (open(ws)) ws.send(JSON.stringify(event));
}

export function broadcast(event: RealtimeEvent) {
  for (const ws of sockets.keys()) send(ws, event);
}

export function sendTo(userId: string, event: RealtimeEvent) {
  for (const [ws, s] of sockets) if (s.userId === userId) send(ws, event);
}

/** 只有一对情侣：发给不是自己的那个人 */
function sendToPartnerOf(userId: string, event: RealtimeEvent) {
  for (const [ws, s] of sockets) if (s.userId !== userId) send(ws, event);
}

/** 某个人现在的状态：在线 = 有前台连接；在看哪张取最近一次更新的前台连接 */
export function peerStateOf(userId: string): PeerState {
  let online = false;
  let latest: SocketInfo | null = null;
  for (const [ws, s] of sockets) {
    if (s.userId !== userId || !open(ws) || !s.active) continue;
    online = true;
    if (!latest || s.lookAt > latest.lookAt) latest = s;
  }
  const visible = online && shareViewing.get(userId) !== false && latest;
  return { online, where: visible ? latest!.where : null, itemId: visible && latest!.where === 'viewer' ? latest!.itemId : null };
}

/** 状态变了才告诉另一半 */
function publishPeer(userId: string, force = false) {
  const state = peerStateOf(userId);
  const key = JSON.stringify(state);
  if (!force && lastSent.get(userId) === key) return;
  lastSent.set(userId, key);
  sendToPartnerOf(userId, { type: 'peer', ...state });
}

/** 新连接：告诉它另一半现在的状态（另一半不在线也要说一声） */
function greet(ws: Socket, userId: string) {
  const partner = [...sockets.values()].find((s) => s.userId !== userId)?.userId;
  send(ws, { type: 'peer', ...(partner ? peerStateOf(partner) : { online: false, where: null, itemId: null }) });
}

export function attachSocket(ws: Socket, userId: string, share = true) {
  shareViewing.set(userId, share);
  sockets.set(ws, { userId, active: false, where: null, itemId: null, lookAt: 0, windowStart: -Infinity, count: 0 });
  greet(ws, userId);
}

export function detachSocket(ws: Socket) {
  const s = sockets.get(ws);
  sockets.delete(ws);
  if (s) publishPeer(s.userId);
}

export function setShareViewing(userId: string, share: boolean) {
  shareViewing.set(userId, share);
  publishPeer(userId);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 处理客户端发来的一条消息；格式不对、太频繁的直接丢掉 */
export function handleMessage(ws: Socket, raw: string, now = Date.now()) {
  const s = sockets.get(ws);
  if (!s) return;
  if (now - s.windowStart > 1000) {
    s.windowStart = now;
    s.count = 0;
  }
  if (++s.count > RATE_LIMIT) return;
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(raw);
  } catch {
    return;
  }
  if (!e || typeof e !== 'object') return;
  const at = new Date(now).toISOString();
  const itemId = typeof e.itemId === 'string' && UUID_RE.test(e.itemId) ? e.itemId : null;

  if (e.type === 'presence') {
    s.active = e.active === true;
    publishPeer(s.userId);
  } else if (e.type === 'look') {
    const where = e.where === 'grid' || e.where === 'viewer' ? e.where : null;
    s.where = where;
    s.itemId = where === 'viewer' ? itemId : null;
    s.lookAt = now;
    publishPeer(s.userId);
  } else if (e.type === 'react') {
    if (!itemId) return;
    const emoji = typeof e.emoji === 'string' && REACTION_EMOJIS.includes(e.emoji) ? e.emoji : undefined;
    const text = emoji ? '' : str(e.text, 30);
    if (!emoji && !text) return;
    sendToPartnerOf(s.userId, { type: 'react', from: s.userId, itemId, ...(emoji ? { emoji } : { text }), at });
  } else if (e.type === 'coview') {
    const action = COVIEW_ACTIONS.includes(e.action as CoviewAction) ? (e.action as CoviewAction) : null;
    if (!action || (action !== 'leave' && !itemId)) return;
    // 关掉了「让 TA 看到我在看哪张」就不能一起看
    if (action !== 'leave' && shareViewing.get(s.userId) === false) return;
    sendToPartnerOf(s.userId, { type: 'coview', from: s.userId, action, ...(itemId ? { itemId } : {}), at });
  }
}

/** 测试用 */
export function resetRealtime() {
  sockets.clear();
  shareViewing.clear();
  lastSent = new Map();
}

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/api/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    let userId: string;
    try {
      userId = app.jwt.verify<{ sub: string }>(token ?? '').sub;
      if (!userId) throw new Error('not a session token');
    } catch {
      socket.close(4401, 'unauthorized');
      return;
    }
    // 读设置的这一会儿收到的消息先存着
    const early: string[] = [];
    const queue = (raw: unknown) => early.push(String(raw));
    socket.on('message', queue);
    const [u] = await db.select({ share: schema.users.shareViewing }).from(schema.users).where(eq(schema.users.id, userId)).catch(() => []);
    if (socket.readyState !== 1) return;
    attachSocket(socket, userId, u?.share !== false);
    socket.off('message', queue);
    for (const raw of early) handleMessage(socket, raw);
    socket.on('message', (raw) => handleMessage(socket, raw.toString()));

    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const ping = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      if (socket.readyState === 1) socket.ping();
    }, 25_000);
    socket.on('close', () => {
      clearInterval(ping);
      detachSocket(socket);
    });
  });
}
