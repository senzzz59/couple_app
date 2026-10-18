import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const ITEM2 = '44444444-4444-4444-8444-444444444444';

function fakeSocket() {
  const got: Record<string, unknown>[] = [];
  return { readyState: 1, send: (m: string) => got.push(JSON.parse(m)), got };
}

test('chat messages keep only the fields their kind uses and reject empty ones', async () => {
  const { messageInput, preview } = await import('../src/chat.ts');
  const text = messageInput.parse({ kind: 'text', content: '  晚上吃啥 ', image: `${ITEM}.jpg`, galleryId: ITEM });
  assert.equal(text.content, '晚上吃啥');
  assert.equal(text.image, null);
  assert.equal(text.galleryId, null);
  assert.throws(() => messageInput.parse({ kind: 'text', content: '   ' }));
  assert.throws(() => messageInput.parse({ kind: 'text', content: 'x'.repeat(1001) }));
  assert.throws(() => messageInput.parse({ kind: 'image' }));
  assert.throws(() => messageInput.parse({ kind: 'image', image: '../etc/passwd' }));
  assert.throws(() => messageInput.parse({ kind: 'voice', voice: `${ITEM}.mp4`, duration: 3 }));
  assert.throws(() => messageInput.parse({ kind: 'voice', voice: `${ITEM}.m4a`, duration: 600 }));
  const voice = messageInput.parse({ kind: 'voice', voice: `${ITEM}.m4a`, duration: 7.5, content: 'ignored' });
  assert.deepEqual([voice.voice, voice.duration, voice.content], [`${ITEM}.m4a`, 7.5, null]);
  assert.equal(messageInput.parse({ kind: 'sticker', sticker: 'blob:hello' }).sticker, 'blob:hello');
  assert.throws(() => messageInput.parse({ kind: 'sticker', sticker: 'javascript:alert(1)' }));
  assert.throws(() => messageInput.parse({ kind: 'photo' }));
  assert.equal(messageInput.parse({ kind: 'photo', galleryId: ITEM }).galleryId, ITEM);
  assert.equal(preview({ kind: 'voice', content: null }), '[语音]');
  assert.equal(preview({ kind: 'text', content: '你好' }), '你好');
});

test('unused-file cleanup keeps chat images, stickers and voice messages', async () => {
  const src = await fs.readFile(new URL('../src/orphans.ts', import.meta.url), 'utf8');
  for (const col of ['s.messages.image', 's.messages.sticker', 's.messages.voice']) assert.ok(src.includes(col), col);
  const { FILE_NAME_RE, VOICE_RE } = await import('../src/files.ts');
  assert.ok(FILE_NAME_RE.test(`${ITEM}.m4a`));
  assert.ok(VOICE_RE.test(`${ITEM}.m4a`));
  assert.ok(!VOICE_RE.test(`${ITEM}.jpg`));
});

test('partner sees where I am in the gallery, only while the app is open', async () => {
  const rt = await import('../src/realtime.ts');
  rt.resetRealtime();
  const a = fakeSocket();
  const b = fakeSocket();
  rt.attachSocket(a, A);
  rt.attachSocket(b, B);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: false, where: null, itemId: null });
  rt.handleMessage(a, JSON.stringify({ type: 'presence', active: true }), 1000);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: true, where: null, itemId: null });
  rt.handleMessage(a, JSON.stringify({ type: 'look', where: 'viewer', itemId: ITEM }), 2000);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: true, where: 'viewer', itemId: ITEM });
  // 自己不会收到自己的位置
  assert.ok(!a.got.some((e) => e.type === 'peer' && e.online));
  // 状态没变不重复发
  const count = b.got.length;
  rt.handleMessage(a, JSON.stringify({ type: 'look', where: 'viewer', itemId: ITEM }), 3000);
  assert.equal(b.got.length, count);
  // 新连上的人马上知道另一半在看哪张
  const b2 = fakeSocket();
  rt.attachSocket(b2, B);
  assert.deepEqual(b2.got[0], { type: 'peer', online: true, where: 'viewer', itemId: ITEM });
  // 切到后台 = 离线
  rt.handleMessage(a, JSON.stringify({ type: 'presence', active: false }), 4000);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: false, where: null, itemId: null });
  rt.handleMessage(a, JSON.stringify({ type: 'presence', active: true }), 5000);
  rt.detachSocket(a);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: false, where: null, itemId: null });
});

test('turning off viewing share hides the photo but keeps online status', async () => {
  const rt = await import('../src/realtime.ts');
  rt.resetRealtime();
  const a = fakeSocket();
  const b = fakeSocket();
  rt.attachSocket(a, A, false);
  rt.attachSocket(b, B);
  rt.handleMessage(a, JSON.stringify({ type: 'presence', active: true }), 1000);
  rt.handleMessage(a, JSON.stringify({ type: 'look', where: 'viewer', itemId: ITEM }), 2000);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: true, where: null, itemId: null });
  // 关掉以后也不能发起一起看
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'invite', itemId: ITEM }), 2100);
  assert.ok(!b.got.some((e) => e.type === 'coview'));
  rt.setShareViewing(A, true);
  assert.deepEqual(b.got.at(-1), { type: 'peer', online: true, where: 'viewer', itemId: ITEM });
});

test('reactions and co-viewing are relayed to the partner and validated', async () => {
  const rt = await import('../src/realtime.ts');
  rt.resetRealtime();
  const a = fakeSocket();
  const b = fakeSocket();
  rt.attachSocket(a, A);
  rt.attachSocket(b, B);
  const relayed = () => b.got.filter((e) => e.type === 'react' || e.type === 'coview');
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: '😍' }), 1000);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: 'blob:love' }), 1000);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: 'blob:evil' }), 1000);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, text: '  就这张！ ' }), 1001);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: '💩' }), 1002);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: 'not-a-uuid', emoji: '😍' }), 1003);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, text: 'x'.repeat(80) }), 1004);
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'invite', itemId: ITEM2 }), 1005);
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'join' }), 1006);
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'goto', itemId: ITEM }), 1007);
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'goto' }), 1007);
  rt.handleMessage(a, JSON.stringify({ type: 'coview', action: 'leave' }), 1007);
  rt.handleMessage(a, 'not json', 1008);
  const got = relayed().map(({ at: _, ...e }) => e);
  assert.deepEqual(got, [
    { type: 'react', from: A, itemId: ITEM, emoji: '😍' },
    { type: 'react', from: A, itemId: ITEM, emoji: 'blob:love' },
    { type: 'react', from: A, itemId: ITEM, text: '就这张！' },
    { type: 'react', from: A, itemId: ITEM, text: 'x'.repeat(30) },
    { type: 'coview', from: A, action: 'invite', itemId: ITEM2 },
    { type: 'coview', from: A, action: 'goto', itemId: ITEM },
    { type: 'coview', from: A, action: 'leave' },
  ]);
  assert.ok(!a.got.some((e) => e.type === 'react'));
});

test('a flood of realtime messages is dropped after the per-second limit', async () => {
  const rt = await import('../src/realtime.ts');
  rt.resetRealtime();
  const a = fakeSocket();
  const b = fakeSocket();
  rt.attachSocket(a, A);
  rt.attachSocket(b, B);
  for (let i = 0; i < 50; i++) rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: '💗' }), 1000 + i);
  assert.equal(b.got.filter((e) => e.type === 'react').length, 15);
  rt.handleMessage(a, JSON.stringify({ type: 'react', itemId: ITEM, emoji: '💗' }), 2100);
  assert.equal(b.got.filter((e) => e.type === 'react').length, 16);
});
