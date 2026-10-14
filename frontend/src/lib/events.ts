import { nextMilestone, nextOccurrence, upcomingFestivals } from './dates';
import type { Anniversary } from './types';

export interface UpcomingEvent {
  key: string;
  title: string;
  emoji: string;
  date: Date;
  daysLeft: number;
  sub: string;
  kind: 'anniversary' | 'festival' | 'milestone';
  id?: string;
}

/** 纪念日 + 恋爱里程碑 + 节日，按距离今天排序 */
export function upcomingEvents(anns: Anniversary[] = [], startDate?: string | null, withFestivals = true): UpcomingEvent[] {
  const list: UpcomingEvent[] = anns
    .map((a) => {
      const o = nextOccurrence(a);
      const sub = !a.yearly ? (o.daysLeft >= 0 ? '' : '已经过去') : a.kind === 'birthday' ? `${o.nth} 岁生日` : o.nth ? `${o.nth} 周年` : '';
      return { key: a.id, id: a.id, title: a.title, emoji: a.emoji || '💞', date: o.date, daysLeft: o.daysLeft, sub, kind: 'anniversary' as const };
    })
    .filter((e) => e.daysLeft >= 0);

  const m = nextMilestone(startDate);
  if (m) list.push({ key: 'milestone', title: `在一起 ${m.target} 天`, emoji: '💞', date: m.date, daysLeft: m.daysLeft, sub: '恋爱里程碑', kind: 'milestone' });
  if (withFestivals) {
    for (const f of upcomingFestivals().slice(0, 4)) list.push({ key: f.key, title: f.title, emoji: f.emoji, date: f.date, daysLeft: f.daysLeft, sub: '节日', kind: 'festival' });
  }
  return list.sort((a, b) => a.daysLeft - b.daysLeft);
}
