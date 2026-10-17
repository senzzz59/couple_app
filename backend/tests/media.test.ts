import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';

import { downloadName, exifTakenAt, galleryCursor, findEmbeddedVideo, mediaFiles, normalizeMedia, videoExt } from '../src/media.ts';
import { crc32, uniqueNames, zipStream } from '../src/zip.ts';

test('video uploads are recognised by mime type or by extension', () => {
  assert.equal(videoExt('video/quicktime', 'IMG_0001.MOV'), 'mov');
  assert.equal(videoExt('video/mp4', 'a.mp4'), 'mp4');
  assert.equal(videoExt('application/octet-stream', 'clip.MOV'), 'mov');
  assert.equal(videoExt('text/plain', 'IMG_0001.MOV'), 'mov');
  assert.equal(videoExt(undefined, 'IMG_0001.mp4'), 'mp4');
  assert.equal(videoExt('image/jpeg', 'photo.jpg'), null);
  assert.equal(videoExt('image/jpeg', 'trick.mov'), null);
});

test('android motion photos expose the embedded mp4 offset; plain jpegs do not', async () => {
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#f27b96' } }).jpeg().toBuffer();
  assert.equal(findEmbeddedVideo(jpeg), -1);
  const mp4Head = Buffer.alloc(24);
  mp4Head.writeUInt32BE(24, 0);
  mp4Head.write('ftypisom', 4, 'latin1');
  const padding = Buffer.alloc(2048, 1);
  const motion = Buffer.concat([jpeg, padding, mp4Head, Buffer.from('moovdata')]);
  assert.equal(findEmbeddedVideo(motion), jpeg.length + padding.length);
});

test('exif dates are read as local camera time and the earliest plausible one wins', () => {
  const exif = Buffer.from('xx2026:10:01 20:30:00\0yy2024:02:14 12:00:00\0zz1970:01:01 00:00:00\0', 'latin1');
  assert.equal(exifTakenAt(exif, 'Asia/Shanghai')?.toISOString(), '2024-02-14T04:00:00.000Z');
  assert.equal(exifTakenAt(Buffer.from('no dates'), 'Asia/Shanghai'), null);
  assert.equal(exifTakenAt(undefined, 'Asia/Shanghai'), null);
});

test('old moments with photos are returned as image media', () => {
  assert.deepEqual(normalizeMedia(['a.jpg'], null), [{ kind: 'image', image: 'a.jpg' }]);
  const media = [{ kind: 'video' as const, image: 'p.jpg', video: 'v.mp4' }];
  assert.deepEqual(normalizeMedia(['p.jpg'], media), media);
  assert.deepEqual(mediaFiles(media), ['p.jpg', 'v.mp4']);
});

test('gallery cursors and download names', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(galleryCursor(`2026-10-14T01:02:03.456Z|${id}`)?.id, id);
  assert.equal(galleryCursor(undefined), null);
  for (const bad of ['x', `bad|${id}`, `2026-10-14T01:02:03.456Z|short`, `2026-10-14T01:02:03.456Z|${id}|x`]) assert.throws(() => galleryCursor(bad));
  const row = { kind: 'image' as const, fileName: 'IMG_1234.HEIC', takenAt: new Date(2026, 0, 2, 3, 4, 5), image: `${id}.jpg`, video: null, original: `${id}.heic` };
  assert.equal(downloadName(row), 'IMG_1234.heic');
  assert.equal(downloadName({ ...row, fileName: null }), 'us-20260102-030405.heic');
  assert.equal(downloadName({ ...row, kind: 'video', video: `${id}.mov`, fileName: 'a/b:c.mov' }), 'a_b_c.mov');
  assert.deepEqual(uniqueNames(['a.jpg', 'A.jpg', 'a.jpg', 'b']), ['a.jpg', 'A (2).jpg', 'a (3).jpg', 'b']);
});

test('zip archives stream valid files that standard tools can extract', async () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'couple-zip-'));
  try {
    const big = Buffer.alloc(300_000, 7);
    await fs.writeFile(path.join(dir, 'big.bin'), big);
    const stream = zipStream([
      { name: '照片.jpg', data: Buffer.from('hello') },
      { name: 'big.bin', path: path.join(dir, 'big.bin') },
    ]);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const zipPath = path.join(dir, 'out.zip');
    await fs.writeFile(zipPath, Buffer.concat(chunks));
    const listing = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("|".join(i.filename+":"+str(i.file_size) for i in z.infolist()))', zipPath]).toString();
    assert.match(listing, /^None\n/);
    assert.match(listing, /照片\.jpg:5\|big\.bin:300000/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
