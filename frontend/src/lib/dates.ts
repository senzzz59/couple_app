import { Lunar, Solar } from 'lunar-javascript';

import type { Anniversary } from './types';

const DAY = 86_400_000;

/** 'YYYY-MM-DD' -> 本地零点 */
export function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

/** 在一起的天数，第一天算第 1 天 */
export const daysTogether = (start: string | null | undefined) => (start ? diffDays(today(), parseDay(start)) + 1 : 0);

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const fmtDate = (d: Date | string, withWeek = false) => {
  const x = typeof d === 'string' ? parseDay(d) : d;
  const y = x.getFullYear() !== new Date().getFullYear() ? `${x.getFullYear()}年` : '';
  return `${y}${x.getMonth() + 1}月${x.getDate()}日${withWeek ? ' ' + WEEK[x.getDay()] : ''}`;
};
export const fmtFullDate = (s: string) => {
  const x = parseDay(s);
  return `${x.getFullYear()}.${x.getMonth() + 1}.${x.getDate()}`;
};

export function lunarLabel(s: string) {
  const d = parseDay(s);
  const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
  return `农历${l.getMonthInChinese()}月${l.getDayInChinese()}`;
}

/** 某个农历月日在公历上的下一次（含今天） */
function nextLunar(month: number, day: number, from: Date): Date {
  const ly = Solar.fromYmd(from.getFullYear(), from.getMonth() + 1, from.getDate()).getLunar().getYear();
  for (const y of [ly - 1, ly, ly + 1, ly + 2]) {
    let s;
    try {
      s = Lunar.fromYmd(y, month, day).getSolar();
    } catch {
      s = Lunar.fromYmd(y, month, day - 1).getSolar(); // 小月没有三十
    }
    const d = new Date(s.getYear(), s.getMonth() - 1, s.getDay());
    if (d >= from) return d;
  }
  return from;
}

function nextSolar(month: number, day: number, from: Date): Date {
  for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    const d = new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate()));
    if (d >= from) return d;
  }
  return from;
}

export interface Occurrence {
  date: Date;
  daysLeft: number;
  /** 第几周年（生日时为岁数），一次性纪念日为 null */
  nth: number | null;
}

export function nextOccurrence(a: Pick<Anniversary, 'date' | 'lunar' | 'yearly'>, from = today()): Occurrence {
  const origin = parseDay(a.date);
  if (!a.yearly) return { date: origin, daysLeft: diffDays(origin, from), nth: null };
  let date: Date;
  if (a.lunar) {
    const l = Solar.fromYmd(origin.getFullYear(), origin.getMonth() + 1, origin.getDate()).getLunar();
    date = nextLunar(Math.abs(l.getMonth()), l.getDay(), from);
  } else {
    date = nextSolar(origin.getMonth() + 1, origin.getDate(), from);
  }
  return { date, daysLeft: diffDays(date, from), nth: date.getFullYear() - origin.getFullYear() };
}

/** 恋爱里程碑：每 100 天、每 520/1314 等特殊数字 */
export function nextMilestone(start: string | null | undefined, from = today()) {
  if (!start) return null;
  const n = diffDays(from, parseDay(start)) + 1;
  const specials = [520, 1314, 2000, 3000, 5200];
  const next100 = Math.max(100, Math.ceil(n / 100) * 100);
  const target = Math.min(next100, ...specials.filter((x) => x >= n));
  const date = new Date(parseDay(start).getTime() + (target - 1) * DAY);
  return { target, date, daysLeft: target - n };
}

export interface Festival {
  key: string;
  title: string;
  emoji: string;
  date: Date;
  daysLeft: number;
}

const FESTIVALS: { key: string; title: string; emoji: string; m: number; d: number; lunar?: boolean }[] = [
  { key: 'newyear', title: '元旦', emoji: '🎆', m: 1, d: 1 },
  { key: 'valentine', title: '情人节', emoji: '🌹', m: 2, d: 14 },
  { key: 'white', title: '白色情人节', emoji: '🤍', m: 3, d: 14 },
  { key: '520', title: '520', emoji: '💌', m: 5, d: 20 },
  { key: 'qixi', title: '七夕', emoji: '🎋', m: 7, d: 7, lunar: true },
  { key: 'midautumn', title: '中秋节', emoji: '🥮', m: 8, d: 15, lunar: true },
  { key: 'eve', title: '平安夜', emoji: '🍎', m: 12, d: 24 },
  { key: 'xmas', title: '圣诞节', emoji: '🎄', m: 12, d: 25 },
  { key: 'spring', title: '春节', emoji: '🧧', m: 1, d: 1, lunar: true },
  { key: 'lantern', title: '元宵节', emoji: '🏮', m: 1, d: 15, lunar: true },
];

export function upcomingFestivals(from = today()): Festival[] {
  return FESTIVALS.map((f) => {
    const date = f.lunar ? nextLunar(f.m, f.d, from) : nextSolar(f.m, f.d, from);
    return { key: f.key, title: f.title, emoji: f.emoji, date, daysLeft: diffDays(date, from) };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 2) return '昨天';
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return fmtDate(toDay(new Date(iso)));
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
