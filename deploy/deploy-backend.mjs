import fs from 'node:fs/promises';
import path from 'node:path';
import { root, repository, run, checkout, withLock, findCompose } from './release-utils.mjs';

// Independent backend rollout, also called by the master deployment workflow.
await withLock('backend', async () => {
  const config = path.join(root, 'shared/backend.env');
  await fs.access(config);
  // Fail before building or migrating if Compose is missing.
  const [composeBin, ...composeArgs] = await findCompose();
  const compose = (file, args, cwd, env) => run(composeBin, [...composeArgs, '-p', 'couple-backend', '--env-file', config, '-f', file, ...args], cwd, env);
  const build = await checkout('backend');
  const previous = await fs.readFile(path.join(root, 'state/backend.json'), 'utf8').then(JSON.parse).catch(() => null);
  try {
    const backend = path.join(build.worktree, 'backend');
    await run('npm', ['ci', '--include=dev'], backend);
    await run('npm', ['run', 'typecheck'], backend);
    await run('npm', ['run', 'db:check'], backend);
    const release = path.join(root, 'releases', build.id);
    await fs.mkdir(release, { recursive: true });
    await fs.cp(backend, release, { recursive: true, filter: (source) => !source.split(path.sep).includes('node_modules') });
    const dockerEnv = { ...process.env, COUPLE_DATA_DIR: path.join(root, 'shared/data') };
    // Build before touching either the database or the currently running API.
    await compose(path.join(release, 'docker-compose.yml'), ['build', 'api'], release, dockerEnv);
    // Backup and apply only committed, pending migrations while the old API is still running.
    await run(process.execPath, [`--env-file=${config}`, path.join(backend, 'node_modules/tsx/dist/cli.mjs'), path.join(backend, 'scripts/predeploy.ts')], backend, { ...process.env, DATABASE_BACKUP_DIR: path.join(root, 'shared/backups') });
    await compose(path.join(release, 'docker-compose.yml'), ['up', '-d', '--no-build', 'api'], release, dockerEnv);
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:8787/api/health', { signal: AbortSignal.timeout(2000) });
        if (response.ok && (await response.json()).ok) { healthy = true; break; }
      } catch { /* API may still be starting or migrating. */ }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!healthy) {
      if (previous?.release) {
        console.error('Backend health check failed; restoring the previous service');
        await compose(path.join(previous.release, 'docker-compose.yml'), ['up', '-d', '--build'], previous.release, dockerEnv);
      }
      throw new Error('Backend health check failed; frontend was not switched');
    }
    await fs.writeFile(path.join(root, 'state/backend.json'), JSON.stringify({ commit: build.commit, release, updatedAt: new Date().toISOString() }, null, 2));
    console.log(`Backend deployed separately: ${build.commit}`);
  } finally {
    await run('git', ['worktree', 'remove', build.worktree], repository).catch((error) => console.error('Build checkout retained:', error.message));
  }
});
