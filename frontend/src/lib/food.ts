import type { Place, Visit } from './types';

export function placeCover(p: Place, visits: Visit[] = []) {
  return p.cover ?? visits.find((v) => v.placeId === p.id && v.photos.length)?.photos[0] ?? null;
}

const CATEGORY_EMOJI: Record<string, string> = {
  火锅: '🍲', 日料: '🍣', 西餐: '🍝', 咖啡: '☕️', 甜品: '🍰', 烧烤: '🍢', 本帮菜: '🥢', 川菜: '🌶️', 粤菜: '🦐', 韩料: '🥘', 东南亚: '🍜', 面: '🍜', 小吃: '🥟', 酒吧: '🍸', 早午餐: '🥞',
};
export const categoryEmoji = (c?: string | null) => (c && CATEGORY_EMOJI[c]) || '🍽️';

export const CATEGORIES = Object.keys(CATEGORY_EMOJI);

/** 约会票的票面颜色：常见菜系固定配色，其它按名字分配，保证同一家店颜色不变 */
const TONES = {
  rose: { bg: '#FBE3E9', ink: '#B04468' },
  apricot: { bg: '#FCE8D8', ink: '#A0562C' },
  sand: { bg: '#F4ECD5', ink: '#856A22' },
  sage: { bg: '#E2EEE0', ink: '#4D7748' },
  sky: { bg: '#E1EBF5', ink: '#46688A' },
  lilac: { bg: '#ECE5F5', ink: '#6C5492' },
};
const CATEGORY_TONE: Record<string, keyof typeof TONES> = {
  火锅: 'rose', 川菜: 'rose', 烧烤: 'apricot', 韩料: 'apricot', 日料: 'sky', 粤菜: 'sky', 西餐: 'lilac', 酒吧: 'lilac',
  咖啡: 'sand', 早午餐: 'sand', 甜品: 'rose', 本帮菜: 'sage', 东南亚: 'sage', 面: 'apricot', 小吃: 'sand',
};
export function categoryTone(key?: string | null) {
  if (key && CATEGORY_TONE[key]) return TONES[CATEGORY_TONE[key]];
  const names = Object.keys(TONES) as (keyof typeof TONES)[];
  let h = 0;
  for (const ch of key ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[names[h % names.length]];
}
