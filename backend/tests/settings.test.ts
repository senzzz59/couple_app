import assert from 'node:assert/strict';
import { test } from 'node:test';

test('todo categories are trimmed, de-duplicated and limited', async () => {
  const { SETTINGS } = await import('../src/settings.ts');
  assert.deepEqual(SETTINGS.todoCategories.parse([' 家务 ', '约会', '家务']), ['家务', '约会']);
  assert.deepEqual(SETTINGS.todoCategories.parse([]), []);
  assert.throws(() => SETTINGS.todoCategories.parse(['']));
  assert.throws(() => SETTINGS.todoCategories.parse(['这个分类名字真的太长了吧']));
  assert.throws(() => SETTINGS.todoCategories.parse(Array.from({ length: 31 }, (_, i) => `c${i}`)));
  assert.throws(() => SETTINGS.todoCategories.parse('家务'));
});

test('reminder time must be HH:MM', async () => {
  const { SETTINGS } = await import('../src/settings.ts');
  for (const ok of ['00:00', '09:05', '23:59']) assert.equal(SETTINGS.reminderTime.parse(ok), ok);
  for (const bad of ['24:00', '9:00', '12:60', 'noon', '']) assert.throws(() => SETTINGS.reminderTime.parse(bad), bad);
});
