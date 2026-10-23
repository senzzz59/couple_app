import fs from 'node:fs/promises';
import path from 'node:path';
import { root, repository, run, checkout, withLock, publishFrontend } from './release-utils.mjs';

await withLock('frontend', async () => {
  const build = await checkout('frontend');
  const record = path.join(root, 'state/frontend.json');
  const previous = await fs.readFile(record, 'utf8').then(JSON.parse).catch(() => null);
  try {
    if (previous?.commit === build.commit && !process.argv.includes('--force') && !process.argv.includes('--prepare')) { console.log('master is already deployed'); return; }
    const frontend = path.join(build.worktree, 'frontend');
    await run('npm', ['ci', '--include=dev'], frontend);
    await run('npm', ['run', 'lint'], frontend);
    await run('npm', ['run', 'typecheck'], frontend);
    await run('npm', ['run', 'build:web'], frontend);
    const release = path.join(root, 'releases', build.id);
    await fs.mkdir(release, { recursive: true });
    // Retain old hashed resources for phones with the previous page still open.
    if (previous?.release) {
      for (const folder of ['_expo', 'assets']) {
        const source = path.join(previous.release, folder);
        if (await fs.stat(source).catch(() => null)) await fs.cp(source, path.join(release, folder), { recursive: true });
      }
    }
    await fs.cp(path.join(frontend, 'dist'), release, { recursive: true });
    // /download/ 指向服务器上保存的安卓 APK（sync-android.mjs），网页版本切换时不受影响
    await fs.mkdir(path.join(root, 'downloads'), { recursive: true });
    await fs.symlink(path.join(root, 'downloads'), path.join(release, 'download'), 'dir');
    const metadata = JSON.parse(await fs.readFile(path.join(release, 'version.json'), 'utf8'));
    if (!metadata.id || !metadata.assets.length) throw new Error('Invalid frontend build');
    if (process.argv.includes('--prepare')) {
      await fs.writeFile(path.join(root, 'state/frontend-pending.json'), JSON.stringify({ commit: build.commit, release, version: metadata.id }));
      console.log(`Frontend ready for backend deployment: ${build.commit}`);
      return;
    }
    await publishFrontend(release);
    await fs.writeFile(record, JSON.stringify({ commit: build.commit, release, previousRelease: previous?.release ?? null, updatedAt: new Date().toISOString(), version: metadata.id }, null, 2));
    console.log(`Frontend deployed: ${build.commit} / ${metadata.id}`);
  } finally {
    await run('git', ['worktree', 'remove', build.worktree], repository).catch((error) => console.error('Build checkout retained:', error.message));
  }
});
