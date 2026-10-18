import data from '@/data/changelog.json';

import { releaseVersions } from './updates';

/** 更新记录：每次功能合并都在 src/data/changelog.json 里加一条（中文） */
export type ChangeType = 'new' | 'improve' | 'fix';
export type Release = { id: string; date: string; title: string; version: string | null; changes: { type: ChangeType; text: string }[] };

export const CHANGE_LABEL: Record<ChangeType, string> = { new: '新功能', improve: '优化', fix: '修复' };

type Raw = { id: string; date: string; title: string; version?: string; changes: { type: string; text: string }[] };

export const RELEASES: Release[] = (data.releases as Raw[]).map((r) => ({
  id: r.id,
  date: r.date,
  title: r.title,
  version: r.version ?? releaseVersions[r.id] ?? null,
  changes: r.changes.map((c) => ({ type: (c.type in CHANGE_LABEL ? c.type : 'improve') as ChangeType, text: c.text })),
}));

/** 2026-10-18 → 10月18日（不是今年的加上年份） */
export function fmtReleaseDate(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}
