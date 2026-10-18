import type { BlobMood } from '@/components/Mascot';

/** 内置表情包：两只团子 + 一句话。id 存进评论的 sticker 字段 */
export type BuiltinSticker = { id: string; who: 'her' | 'him'; mood: BlobMood; emoji: string; text: string };

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  { id: 'blob:miss', who: 'her', mood: 'love', emoji: '💗', text: '想你' },
  { id: 'blob:hug', who: 'him', mood: 'happy', emoji: '🤗', text: '抱抱' },
  { id: 'blob:kiss', who: 'her', mood: 'kiss', emoji: '💋', text: '亲亲' },
  { id: 'blob:love', who: 'him', mood: 'love', emoji: '❤️', text: '爱你' },
  { id: 'blob:cuddle', who: 'her', mood: 'shy', emoji: '🫶', text: '贴贴' },
  { id: 'blob:pat', who: 'him', mood: 'happy', emoji: '🤚', text: '摸摸头' },
  { id: 'blob:morning', who: 'her', mood: 'normal', emoji: '☀️', text: '早安' },
  { id: 'blob:night', who: 'him', mood: 'sleepy', emoji: '🌙', text: '晚安' },
  { id: 'blob:nightkiss', who: 'her', mood: 'kiss', emoji: '🌙', text: '晚安亲亲' },
  { id: 'blob:there', who: 'him', mood: 'stare', emoji: '👀', text: '在吗' },
  { id: 'blob:hungry', who: 'him', mood: 'normal', emoji: '🍜', text: '饿饿' },
  { id: 'blob:yay', who: 'her', mood: 'happy', emoji: '🎉', text: '好耶' },
  { id: 'blob:haha', who: 'him', mood: 'laugh', emoji: '🤣', text: '哈哈哈' },
  { id: 'blob:wow', who: 'her', mood: 'wow', emoji: '✨', text: '哇' },
  { id: 'blob:shocked', who: 'him', mood: 'stare', emoji: '😱', text: '惊呆' },
  { id: 'blob:hmph', who: 'her', mood: 'angry', emoji: '💢', text: '哼' },
  { id: 'blob:mad', who: 'him', mood: 'angry', emoji: '😤', text: '生气' },
  { id: 'blob:wronged', who: 'her', mood: 'cry', emoji: '🥺', text: '委屈' },
  { id: 'blob:sorry', who: 'him', mood: 'cry', emoji: '🙏', text: '错了嘛' },
  { id: 'blob:ok', who: 'her', mood: 'happy', emoji: '👌', text: '好哒' },
  { id: 'blob:roger', who: 'him', mood: 'normal', emoji: '🫡', text: '收到' },
  { id: 'blob:cheer', who: 'her', mood: 'wow', emoji: '💪', text: '加油' },
  { id: 'blob:sleepy', who: 'him', mood: 'sleepy', emoji: '💤', text: '困困' },
  { id: 'blob:pretty', who: 'him', mood: 'love', emoji: '😍', text: '好看' },
  { id: 'blob:wait', who: 'her', mood: 'normal', emoji: '⏰', text: '等你' },
  { id: 'blob:proud', who: 'him', mood: 'happy', emoji: '👍', text: '真棒' },
  { id: 'blob:shy', who: 'her', mood: 'shy', emoji: '🙈', text: '害羞' },
];

export const builtinSticker = (id: string | null | undefined) => BUILTIN_STICKERS.find((s) => s.id === id);

/** 评论里常用的表情 */
export const EMOJIS = [
  '😀', '😂', '🥹', '😊', '🥰', '😍', '😘', '😚', '🤗', '🤭', '😳', '🥺', '😭', '😤', '😡', '😴',
  '🤤', '😋', '🤔', '🙄', '😏', '😎', '🤩', '🥳', '😇', '🫶', '❤️', '💕', '💗', '💔', '✨', '🔥',
  '👍', '👌', '👏', '🙏', '💪', '🤝', '👀', '🌹', '🌸', '🍰', '🍜', '🍺', '☕', '🎁', '🎉', '🌙',
];

/** 发出去会下「表情雨」的表情包 → 雨里飘的东西 */
export const RAIN_STICKERS: Record<string, string> = {
  'blob:love': '❤️',
  'blob:kiss': '💋',
  'blob:miss': '💗',
  'blob:hug': '🤗',
  'blob:yay': '🎉',
  'blob:cuddle': '💞',
  'blob:nightkiss': '🌙',
};

/** 纯表情消息里出现这些就下表情雨 */
export const RAIN_EMOJIS = ['💗', '❤️', '💕', '😘', '🥰', '🎉', '🥳', '🌹', '✨', '😍', '🔥'];

/** 相册里给照片的团子回应（id 和服务器白名单一致） */
export const BLOB_REACTIONS: { id: string; mood: BlobMood; label: string; burst: string }[] = [
  { id: 'blob:love', mood: 'love', label: '心动', burst: '💗' },
  { id: 'blob:laugh', mood: 'laugh', label: '笑死', burst: '😂' },
  { id: 'blob:wow', mood: 'wow', label: '好看', burst: '✨' },
  { id: 'blob:stare', mood: 'stare', label: '盯', burst: '👀' },
];
export const blobReaction = (id: string | undefined) => BLOB_REACTIONS.find((r) => r.id === id);
/** 提示里怎么写这个回应：团子回应写成「心动 💗」 */
export const reactionText = (r: { emoji?: string; text?: string }) => {
  const b = blobReaction(r.emoji);
  return b ? `${b.label} ${b.burst}` : (r.emoji ?? r.text ?? '');
};

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;
/** 只有 1–3 个表情、没有别的字：聊天里放大显示、带特效 */
export const isEmojiOnly = (text: string | null | undefined) => !!text && EMOJI_ONLY.test(text.trim());
/** 这条消息要不要下雨；要的话返回飘的符号 */
export function rainFor(m: { kind: string; content: string | null; sticker: string | null }): string | null {
  if (m.kind === 'sticker') return (m.sticker && RAIN_STICKERS[m.sticker]) || null;
  if (m.kind === 'text' && isEmojiOnly(m.content)) return RAIN_EMOJIS.find((e) => m.content!.includes(e)) ?? null;
  return null;
}
