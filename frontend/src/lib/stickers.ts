import type { BlobMood } from '@/components/Mascot';

/** 内置表情包：两只团子 + 一句话。id 存进评论的 sticker 字段 */
export type BuiltinSticker = { id: string; who: 'her' | 'him'; mood: BlobMood; emoji: string; text: string };

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  { id: 'blob:miss', who: 'her', mood: 'happy', emoji: '💗', text: '想你' },
  { id: 'blob:hug', who: 'him', mood: 'happy', emoji: '🤗', text: '抱抱' },
  { id: 'blob:kiss', who: 'her', mood: 'happy', emoji: '💋', text: '亲亲' },
  { id: 'blob:love', who: 'him', mood: 'happy', emoji: '❤️', text: '爱你' },
  { id: 'blob:morning', who: 'her', mood: 'normal', emoji: '☀️', text: '早安' },
  { id: 'blob:night', who: 'him', mood: 'sleepy', emoji: '🌙', text: '晚安' },
  { id: 'blob:hungry', who: 'him', mood: 'normal', emoji: '🍜', text: '饿饿' },
  { id: 'blob:yay', who: 'her', mood: 'happy', emoji: '🎉', text: '好耶' },
  { id: 'blob:hmph', who: 'her', mood: 'normal', emoji: '💢', text: '哼' },
  { id: 'blob:sorry', who: 'him', mood: 'sleepy', emoji: '🥺', text: '错了嘛' },
  { id: 'blob:ok', who: 'her', mood: 'happy', emoji: '👌', text: '好哒' },
  { id: 'blob:sleepy', who: 'him', mood: 'sleepy', emoji: '💤', text: '困困' },
  { id: 'blob:pretty', who: 'him', mood: 'happy', emoji: '😍', text: '好看' },
  { id: 'blob:wait', who: 'her', mood: 'normal', emoji: '⏰', text: '等你' },
  { id: 'blob:proud', who: 'him', mood: 'happy', emoji: '👍', text: '真棒' },
  { id: 'blob:shy', who: 'her', mood: 'sleepy', emoji: '🙈', text: '害羞' },
];

export const builtinSticker = (id: string | null | undefined) => BUILTIN_STICKERS.find((s) => s.id === id);

/** 评论里常用的表情 */
export const EMOJIS = [
  '😀', '😂', '🥹', '😊', '🥰', '😍', '😘', '😚', '🤗', '🤭', '😳', '🥺', '😭', '😤', '😡', '😴',
  '🤤', '😋', '🤔', '🙄', '😏', '😎', '🤩', '🥳', '😇', '🫶', '❤️', '💕', '💗', '💔', '✨', '🔥',
  '👍', '👌', '👏', '🙏', '💪', '🤝', '👀', '🌹', '🌸', '🍰', '🍜', '🍺', '☕', '🎁', '🎉', '🌙',
];
