import type { ChatMessage } from './types';

/** 列表 / 提示里显示的一句话 */
export function chatPreview(m: Pick<ChatMessage, 'kind' | 'content'>) {
  if (m.kind === 'text') return m.content ?? '';
  if (m.kind === 'image') return '[图片]';
  if (m.kind === 'sticker') return '[表情]';
  if (m.kind === 'voice') return '[语音]';
  return '[照片] 给你看这张';
}

/** 聊天里的时间：今天 21:14 / 昨天 21:14 / 3月2日 21:14 / 2025年3月2日 21:14 */
export function chatTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return hm;
  if (diff === 1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 两条消息隔了多久要插一个时间 */
export const TIME_GAP_MS = 5 * 60_000;

/** 撤回时限，和服务器一致 */
export const RECALL_MS = 2 * 60_000;

/** 刚发出 / 刚收到的消息（聊天页用来放特效） */
const freshListeners = new Set<(m: ChatMessage) => void>();
export const onFreshMessage = (fn: (m: ChatMessage) => void) => {
  freshListeners.add(fn);
  return () => void freshListeners.delete(fn);
};
export const freshMessage = (m: ChatMessage) => freshListeners.forEach((fn) => fn(m));
