import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { syncAndroidApk } from '../../deploy/sync-android.mjs';

const apk = Buffer.from('fake apk bytes');
const sha256 = createHash('sha256').update(apk).digest('hex');
const release = { version: '1.1.0', build: 'd37f03f9-4877-46d1-87b0-39c4392bbb7f', url: 'https://expo.dev/artifacts/eas/x.apk', sha256 };

async function withRoot(action: (root: string) => Promise<void>) {
  const prefix = path.join(process.cwd(), '.android-test-');
  const root = await fs.mkdtemp(prefix);
  try { await action(root); } finally {
    if (path.resolve(root).startsWith(prefix)) await fs.rm(root, { recursive: true, force: true });
  }
}

test('downloads the APK once, verifies it and points us.apk at it', async () => {
  await withRoot(async (root) => {
    let downloads = 0;
    const fetchImpl = async () => { downloads++; return new Response(apk); };
    const first = await syncAndroidApk({ root, release, fetchImpl, log: () => {} });
    assert.equal(first.updated, true);
    assert.deepEqual(await fs.readFile(path.join(root, 'downloads/us.apk')), apk);
    const info = JSON.parse(await fs.readFile(path.join(root, 'downloads/android.json'), 'utf8'));
    assert.equal(info.version, '1.1.0');
    assert.equal(info.size, apk.length);
    const second = await syncAndroidApk({ root, release, fetchImpl, log: () => {} });
    assert.equal(second.updated, false);
    assert.equal(downloads, 1);
  });
});

test('rejects a download whose sha256 does not match and keeps the previous APK', async () => {
  await withRoot(async (root) => {
    await syncAndroidApk({ root, release, fetchImpl: async () => new Response(apk), log: () => {} });
    const next = { ...release, version: '1.2.0', build: 'aaaaaaaa-0000' };
    await assert.rejects(syncAndroidApk({ root, release: next, fetchImpl: async () => new Response('tampered'), log: () => {} }), /sha256/);
    assert.deepEqual(await fs.readFile(path.join(root, 'downloads/us.apk')), apk);
  });
});

test('skips when no release is recorded', async () => {
  await withRoot(async (root) => {
    assert.deepEqual(await syncAndroidApk({ root, release: null }), { updated: false, reason: 'no release' });
  });
});
