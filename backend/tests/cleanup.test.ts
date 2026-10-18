import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRACE_MS, planCleanup, type Stored } from '../src/cleanupPlan.ts';
import { dayIn, visitPhotosOf } from '../src/media.ts';

const now = Date.UTC(2026, 9, 18);
const old = now - GRACE_MS - 1;
const ours = (_area: string, name: string) => /^[0-9a-f-]{36}\.\w+$/.test(name);
const n = (i: number) => `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000.jpg`;

test('only old, unreferenced files we created are removed', () => {
  const stored: Stored[] = [
    { area: 'main', name: n(1), modifiedAt: old }, // 有引用
    { area: 'thumb', name: n(1), modifiedAt: old }, // 有引用的缩略图
    { area: 'main', name: n(2), modifiedAt: old }, // 没引用 → 删
    { area: 'thumb', name: n(2), modifiedAt: old },
    { area: 'main', name: n(3), modifiedAt: now - 1000 }, // 太新
    { area: 'orig', name: n(4), modifiedAt: old }, // 相册原图有引用
    { area: 'orig', name: n(1), modifiedAt: old }, // 名字被普通文件引用，但不是原图 → 删
    { area: 'main', name: 'readme.txt', modifiedAt: old }, // 不是我们的
  ];
  const plan = planCleanup(stored, { files: new Set([n(1)]), originals: new Set([n(4)]) }, ours, now);
  assert.deepEqual(plan.remove.map((f) => `${f.area}/${f.name}`).sort(), [`main/${n(2)}`, `orig/${n(1)}`, `thumb/${n(2)}`].sort());
  assert.equal(plan.suspicious, false);
});

test('a file that still has a recent copy (local or remote) is kept', () => {
  const stored: Stored[] = [
    { area: 'main', name: n(5), modifiedAt: old },
    { area: 'main', name: n(5), modifiedAt: now - 1000 },
  ];
  assert.equal(planCleanup(stored, { files: new Set(), originals: new Set() }, ours, now).remove.length, 0);
});

test('refuses to delete when most files look unused', () => {
  const stored: Stored[] = Array.from({ length: 30 }, (_, i) => ({ area: 'main' as const, name: n(i), modifiedAt: old }));
  const plan = planCleanup(stored, { files: new Set([n(0)]), originals: new Set() }, ours, now);
  assert.equal(plan.suspicious, true);
  // 少量孤儿照常删除
  assert.equal(planCleanup(stored.slice(0, 10), { files: new Set(), originals: new Set() }, ours, now).suspicious, false);
});

test('visit photos come from photos and Live stills, not videos', () => {
  assert.deepEqual(
    visitPhotosOf([
      { kind: 'image', image: 'a.jpg' },
      { kind: 'video', image: 'poster.jpg', video: 'v.mp4' },
      { kind: 'live', image: 'b.jpg', video: 'b.mp4' },
      { kind: 'image', image: 'a.jpg' },
    ]),
    ['a.jpg', 'b.jpg']
  );
});

test('visit date uses the couple time zone', () => {
  // 北京时间 10 月 19 日 01:30 = UTC 10 月 18 日 17:30
  assert.equal(dayIn('Asia/Shanghai', new Date(Date.UTC(2026, 9, 18, 17, 30))), '2026-10-19');
});
