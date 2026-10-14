import type { Place, Visit } from './types';

export function placeCover(p: Place, visits: Visit[] = []) {
  return p.cover ?? visits.find((v) => v.placeId === p.id && v.photos.length)?.photos[0] ?? null;
}

const CATEGORY_EMOJI: Record<string, string> = {
  火锅: '🍲', 日料: '🍣', 西餐: '🍝', 咖啡: '☕️', 甜品: '🍰', 烧烤: '🍢', 本帮菜: '🥢', 川菜: '🌶️', 粤菜: '🦐', 韩料: '🥘', 东南亚: '🍜', 面: '🍜', 小吃: '🥟', 酒吧: '🍸', 早午餐: '🥞',
};
export const categoryEmoji = (c?: string | null) => (c && CATEGORY_EMOJI[c]) || '🍽️';

export const CATEGORIES = Object.keys(CATEGORY_EMOJI);
