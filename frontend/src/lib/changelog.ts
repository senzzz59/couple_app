import data from '@/data/changelog.json';

import { releaseVersions, type ReleaseNote } from './updates';

/** 更新记录：每次功能合并都在 src/data/changelog.json 里加一条（中文） */
export type ChangeType = 'new' | 'improve' | 'fix';
export type Release = { id: string; date: string; title: string; version: string | null; changes: { type: ChangeType; text: string }[] };

export const CHANGE_LABEL: Record<ChangeType, string> = { new: '新功能', improve: '优化', fix: '修复' };

type Raw = { id: string; date: string; title: string; version?: string; changes: { type: string; text: string }[] };

const toRelease = (r: Raw | ReleaseNote): Release => ({
  id: r.id,
  date: r.date,
  title: r.title,
  version: r.version ?? releaseVersions[r.id] ?? null,
  changes: r.changes.map((c) => ({ type: (c.type in CHANGE_LABEL ? c.type : 'improve') as ChangeType, text: c.text })),
});

export const RELEASES: Release[] = (data.releases as Raw[]).map(toRelease);

/** 新版本带来的更新：新版本的更新记录里，这个版本还没有的那些 */
export function releasesSince(notes: ReleaseNote[]): Release[] {
  const known = new Set(RELEASES.map((r) => r.id));
  return notes.filter((n) => !known.has(n.id)).map(toRelease);
}

/** 2026-10-18 → 10月18日（不是今年的加上年份） */
export function fmtReleaseDate(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}
