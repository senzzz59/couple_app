/**
 * 实时通道的收发：session 负责连接，这里负责把收到的消息分发给关心的地方。
 * 除了服务器的消息，连接建立 / 断开时也会发出 { type: 'open' } / { type: 'close' }。
 */
export type RealtimeMessage = { type: string } & Record<string, unknown>;
type Listener = (e: RealtimeMessage) => void;

const listeners = new Map<string, Set<Listener>>();
let sender: ((msg: object) => boolean) | null = null;

export function onRealtime<T = RealtimeMessage>(type: string, fn: (e: T) => void) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  const set = listeners.get(type)!;
  const l = fn as unknown as Listener;
  set.add(l);
  return () => void set.delete(l);
}

export function emitRealtime(e: RealtimeMessage) {
  listeners.get(e.type)?.forEach((fn) => {
    try {
      fn(e);
    } catch (err) {
      console.warn('realtime listener failed', err);
    }
  });
}

export function setRealtimeSender(fn: ((msg: object) => boolean) | null) {
  sender = fn;
}

/** 发给服务器；没连上时返回 false（不排队，重连后各自重发最新状态） */
export const sendRealtime = (msg: object) => sender?.(msg) ?? false;
