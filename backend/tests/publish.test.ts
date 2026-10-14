import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { publishFrontend } from '../../deploy/release-utils.mjs';

async function fixture() {
  const prefix = path.join(process.cwd(), '.publish-test-');
  const directory = await fs.mkdtemp(prefix);
  const link = path.join(directory, 'couple.senfoundry.com');
  const release = path.join(directory, 'release');
  await fs.mkdir(link);
  await fs.writeFile(path.join(link, 'index.html'), 'old website');
  await fs.mkdir(release);
  await fs.writeFile(path.join(release, 'index.html'), 'new website');
  const io = { ...fs, symlink: (target: string, destination: string) => fs.symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir') };
  const clean = async () => {
    if (!path.resolve(directory).startsWith(prefix)) throw new Error('Invalid test cleanup path');
    await fs.rm(directory, { recursive: true, force: true });
  };
  return { directory, link, release, io, clean };
}

test('publishing keeps the Baota website path and preserves the original directory', async () => {
  const f = await fixture();
  try {
    await publishFrontend(f.release, { link: f.link, io: f.io });
    assert.equal(await fs.readFile(path.join(f.link, 'index.html'), 'utf8'), 'new website');
    const backups = (await fs.readdir(f.directory)).filter((name) => name.startsWith('couple.senfoundry.com.backup-'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(f.directory, backups[0], 'index.html'), 'utf8'), 'old website');
  } finally { await f.clean(); }
});

test('a failed website switch restores the original website directory', async () => {
  const f = await fixture();
  try {
    const io = { ...f.io, rename: async (source: string, destination: string) => {
      if (source.includes('.next-')) throw new Error('simulated publication failure');
      return fs.rename(source, destination);
    } };
    await assert.rejects(() => publishFrontend(f.release, { link: f.link, io }), /simulated publication failure/);
    assert.equal(await fs.readFile(path.join(f.link, 'index.html'), 'utf8'), 'old website');
    assert.ok(!(await fs.readdir(f.directory)).some((name) => name.includes('.next-') || name.includes('.backup-')));
  } finally { await f.clean(); }
});
