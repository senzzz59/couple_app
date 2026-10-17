import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/**
 * 极简实时通道：任何数据变化都广播 { type: 'change', collection }，
 * 客户端收到后重新拉取对应列表。两个人的数据量很小，这样最稳。
 */
const sockets = new Map<WebSocket, string>();
const activeSockets = new Set<WebSocket>();
export const isOnline = (userId: string) => [...sockets].some(([ws, uid]) => uid === userId && ws.readyState === 1 && activeSockets.has(ws));

export type RealtimeEvent =
  | { type: 'change'; collection: string; id?: string; by?: string }
  | { type: 'nudge'; id: string; kind: string; from: string; at: string; remotePush?: boolean };

export function broadcast(event: RealtimeEvent) {
  const msg = JSON.stringify(event);
  for (const ws of sockets.keys()) if (ws.readyState === 1) ws.send(msg);
}

export function sendTo(userId: string, event: RealtimeEvent) {
  const msg = JSON.stringify(event);
  for (const [ws, uid] of sockets) if (uid === userId && ws.readyState === 1) ws.send(msg);
}

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token;
    let userId: string;
    try {
      userId = app.jwt.verify<{ sub: string }>(token ?? '').sub;
      if (!userId) throw new Error('not a session token');
    } catch {
      socket.close(4401, 'unauthorized');
      return;
    }
    sockets.set(socket, userId);
    socket.on('message', (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === 'presence') {
          if (event.active === true) activeSockets.add(socket);
          else activeSockets.delete(socket);
        }
      } catch { /* Ignore malformed presence messages. */ }
    });
    let alive = true;
    socket.on('pong', () => { alive = true; });
    const ping = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      if (socket.readyState === 1) socket.ping();
    }, 25_000);
    socket.on('close', () => {
      clearInterval(ping);
      sockets.delete(socket);
      activeSockets.delete(socket);
    });
  });
}
