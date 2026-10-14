import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysTogether, nextMilestone, toDay } from '../../frontend/src/lib/dates.ts';
import { mascotFor } from '../../frontend/src/lib/profile.ts';

test('elapsed relationship days start at zero and handle month/year boundaries', () => {
  assert.equal(daysTogether('2026-10-15', new Date(2026, 9, 15)), 0);
  assert.equal(daysTogether('2026-10-14', new Date(2026, 9, 15)), 1);
  assert.equal(daysTogether('2026-10-16', new Date(2026, 9, 15)), 0);
  assert.equal(daysTogether(null, new Date(2026, 9, 15)), 0);
  assert.equal(daysTogether('2025-12-31', new Date(2026, 0, 1)), 1);
  assert.equal(daysTogether('2024-02-28', new Date(2024, 2, 1)), 2);
});

test('milestone dates and reminders agree with elapsed days including 520 days', () => {
  const start = '2025-01-01';
  for (const target of [100, 200, 500, 520, 600, 1314]) {
    const date = new Date(2025, 0, 1 + target);
    const previous = new Date(2025, 0, target);
    const milestone = nextMilestone(start, previous)!;
    assert.equal(milestone.target, target);
    assert.equal(milestone.daysLeft, 1);
    assert.equal(toDay(milestone.date), toDay(date));
    assert.equal(daysTogether(start, date), target);
    assert.equal(nextMilestone(start, date)?.daysLeft, 0);
    assert.ok(nextMilestone(start, new Date(2025, 0, 2 + target))!.target > target);
  }
});

test('calendar days and milestone midnight remain correct across daylight saving changes', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(daysTogether('2026-03-07', new Date(2026, 2, 9)), 2);
    const milestone = nextMilestone('2026-01-01', new Date(2026, 3, 10))!;
    assert.equal(toDay(milestone.date), '2026-04-11');
    assert.equal(milestone.date.getHours(), 0);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('mascots follow the saved gender without inferring an unset gender', () => {
  assert.equal(mascotFor({ gender: 'male' }), 'him');
  assert.equal(mascotFor({ gender: 'female' }), 'her');
  assert.equal(mascotFor({ gender: null }), undefined);
  assert.equal(mascotFor(null), undefined);
  assert.equal(mascotFor(undefined), undefined);
});
