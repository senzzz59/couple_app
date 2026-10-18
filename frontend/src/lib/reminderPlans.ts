import { nextMilestone, nextOccurrence, parseDay, upcomingFestivals } from './dates';
import type { Anniversary, Capsule, Todo } from './types';

type Plan = { at: Date; title: string; body: string };

/** 纪念日等提醒的默认时间；用户可以在纪念日页面改 */
export const DEFAULT_REMINDER_TIME = '09:00';

export function reminderPlans(anns: Anniversary[], todos: Todo[], startDate?: string | null, capsules: Capsule[] = [], now = Date.now(), remindAt = DEFAULT_REMINDER_TIME): Plan[] {
  const plans: Plan[] = [];
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(remindAt) ? remindAt : DEFAULT_REMINDER_TIME).split(':').map(Number);
  const at9 = (d: Date, offsetDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - offsetDays, hh, mm, 0);

  for (const a of anns) {
    let from = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
    for (let year = 0; year < (a.yearly ? 3 : 1); year++) {
      const occ = nextOccurrence(a, from);
      for (const before of a.remind ?? [0]) {
        const when = at9(occ.date, before);
        const what = a.kind === 'birthday' ? '生日' : occ.nth ? `${occ.nth} 周年` : '';
        plans.push({
          at: when,
          title: `${a.emoji ?? '💞'} ${a.title}`,
          body: before === 0 ? `就是今天！${what ? `${what}快乐～` : ''}` : `还有 ${before} 天${what ? `（${what}）` : ''}，记得准备惊喜`,
        });
      }
      from = new Date(occ.date.getFullYear(), occ.date.getMonth(), occ.date.getDate() + 1);
    }
  }
  for (let year = 0; year < 3; year++) {
    const from = new Date(new Date(now).getFullYear() + year, new Date(now).getMonth(), new Date(now).getDate());
    for (const f of upcomingFestivals(from)) {
      plans.push({ at: at9(f.date, 1), title: `${f.emoji} 明天是${f.title}`, body: '约个会吧？' });
    }
  }
  if (startDate) {
    let from = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
    for (let i = 0; i < 14; i++) {
      const m = nextMilestone(startDate, from);
      if (!m) break;
      plans.push({ at: at9(m.date), title: `💞 在一起第 ${m.target} 天`, body: '今天是值得纪念的日子' });
      from = new Date(m.date.getFullYear(), m.date.getMonth(), m.date.getDate() + 1);
    }
  }
  for (const c of capsules) {
    if (c.locked) plans.push({ at: at9(parseDay(c.unlockAt)), title: '💌 时光胶囊可以打开了', body: c.title });
  }
  for (const t of todos) {
    if (t.done || !t.due) continue;
    plans.push({ at: new Date(t.due), title: '✅ 清单提醒', body: t.title });
  }

  const unique = new Map(plans.map((p) => [`${p.at.getTime()}|${p.title}|${p.body}`, p]));
  const all = [...unique.values()].filter((p) => Number.isFinite(p.at.getTime()) && p.at.getTime() > now).sort((a, b) => a.at.getTime() - b.at.getTime());
  const upcoming = all.slice(0, 59);
  if (upcoming.length) {
    const last = upcoming[upcoming.length - 1].at;
    upcoming.push({ at: new Date(last.getTime() + 60_000), title: '更新一下提醒日程吧', body: '打开 us.，继续安排接下来的纪念日和清单提醒' });
  }
  return upcoming;
}
