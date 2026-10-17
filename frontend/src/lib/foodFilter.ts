import { distanceKm } from './location';
import type { Place } from './types';

/**
 * 美食筛选：在哪（全部 / 附近 / 某个城市）、什么类型、怎么排。
 * 想去、吃过、随机转盘共用同一套。
 */
export type FoodSort = 'recent' | 'near' | 'price' | 'rating';
export type FoodFilter = { where: 'all' | 'near' | `city:${string}`; radius: number; category: string | null; sort: FoodSort };
export const DEFAULT_FILTER: FoodFilter = { where: 'all', radius: 5, category: null, sort: 'recent' };
export const RADII = [1, 3, 5, 10, 20];

export type FilteredPlace = Place & { km: number | null };

export function applyFoodFilter(list: Place[], f: FoodFilter, pos: { lat: number; lng: number } | null): FilteredPlace[] {
  let out: FilteredPlace[] = list.map((p) => ({ ...p, km: pos ? distanceKm(pos, p) : null }));
  if (f.where === 'near') out = pos ? out.filter((p) => p.km != null && p.km <= f.radius) : out;
  else if (f.where.startsWith('city:')) out = out.filter((p) => (p.city ?? '') === f.where.slice(5));
  if (f.category) out = out.filter((p) => p.category === f.category);
  const sorters: Record<FoodSort, (a: FilteredPlace, b: FilteredPlace) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    near: (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity),
    price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  };
  // 「附近」默认按距离排
  const sort = f.where === 'near' && f.sort === 'recent' ? 'near' : f.sort;
  return out.sort(sorters[sort]);
}

/** 筛选项里的城市（按店铺数量排序） */
export function cityOptions(list: Place[]) {
  const counts = new Map<string, number>();
  for (const p of list) if (p.city) counts.set(p.city, (counts.get(p.city) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([city, count]) => ({ city, count }));
}

export function categoryOptions(list: Place[]) {
  const counts = new Map<string, number>();
  for (const p of list) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }));
}

export const whereLabel = (f: FoodFilter) => (f.where === 'all' ? '全部城市' : f.where === 'near' ? `附近 ${f.radius}km` : f.where.slice(5));
export const sortLabel: Record<FoodSort, string> = { recent: '最近收藏', near: '离我最近', price: '人均从低到高', rating: '评分最高' };
