import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleAnswers } from '../src/answerPrivacy.ts';
import { momentPagination } from '../src/momentPagination.ts';
import { reminderPlans } from '../../frontend/src/lib/reminderPlans.ts';
import { nextMilestone, toDay } from '../../frontend/src/lib/dates.ts';
import type { Anniversary, Todo } from '../../frontend/src/lib/types.ts';

test('answers stay hidden per day and reveal only after the viewer answered that day', () => {
  const rows = [
    { day: '2026-10-14', createdBy: 'partner', content: 'secret today' },
    { day: '2026-10-13', createdBy: 'partner', content: 'yesterday' },
    { day: '2026-10-13', createdBy: 'me', content: 'my answer' },
  ];
  const result = visibleAnswers(rows, 'me');
  assert.equal(result[0].content, null);
  assert.equal(result[1].content, 'yesterday');
  assert.equal(result[2].content, 'my answer');
  assert.equal(rows[0].content, 'secret today');
  assert.ok(visibleAnswers([...rows, { day: '2026-10-14', createdBy: 'me', content: 'answered' }], 'me').every((a) => a.content !== null));
});

test('pagination preserves millisecond timestamps and rejects malformed cursors and limits', () => {
  assert.equal(momentPagination({}).limit, 30);
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const page = momentPagination({ before: `2026-10-14T01:02:03.456Z|${id}` });
  assert.equal(page.before?.at.toISOString(), '2026-10-14T01:02:03.456Z');
  assert.equal(page.before?.id, id);
  for (const before of ['', 'bad', `2026-10-14T01:02:03.456Z|${id}|extra`]) assert.throws(() => momentPagination({ before }));
  for (const limit of ['-1', '0', '101', '2.5', 'NaN']) assert.throws(() => momentPagination({ limit }));
});

test('anniversary reminders include later years after this year’s notification has passed', () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const anniversary = { title: '周年测试', date: '2020-10-14', kind: 'love', yearly: true, lunar: false, remind: [0, 0] } as Anniversary;
  const plans = reminderPlans([anniversary], [], undefined, [], now);
  const matching = plans.filter((p) => p.title.includes('周年测试'));
  assert.deepEqual(matching.map((p) => p.at.getFullYear()), [2027, 2028]);
  assert.ok(plans.every((p) => p.at.getTime() > now));
  assert.equal(new Set(plans.map((p) => `${p.at.getTime()}|${p.title}|${p.body}`)).size, plans.length);
});

test('reminder quota retains earliest deadlines, excludes completed todos and reserves a refill notice', () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const todos = Array.from({ length: 80 }, (_, i) => ({ title: `task ${i}`, due: new Date(now + (i + 1) * 60_000).toISOString(), done: false }) as Todo);
  todos.push({ title: 'completed', due: new Date(now + 1).toISOString(), done: true } as Todo);
  const plans = reminderPlans([], todos, undefined, [], now);
  assert.equal(plans.length, 60);
  assert.equal(plans[0].body, 'task 0');
  assert.equal(plans[58].body, 'task 58');
  assert.equal(plans[59].title, '更新一下提醒日程吧');
  assert.ok(!plans.some((p) => p.body === 'completed'));
});

test('today’s milestone is included, then advances to the next milestone', () => {
  const start = new Date(2026, 0, 1);
  const day100 = new Date(2026, 0, 101);
  assert.equal(nextMilestone(toDay(start), day100)?.target, 100);
  assert.equal(nextMilestone(toDay(start), new Date(2026, 0, 102))?.target, 200);
});
