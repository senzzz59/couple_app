import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, run, withLock, publishFrontend } from './release-utils.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
await withLock('all', async () => {
  // Build first. A failed frontend build never touches running services.
  await run(process.execPath, [path.join(scripts, 'deploy-frontend.mjs'), '--prepare'], scripts);
  const pending = JSON.parse(await fs.readFile(path.join(root, 'state/frontend-pending.json'), 'utf8'));
  if (!/^[0-9a-f]{40}$/.test(pending.commit)) throw new Error('Invalid prepared commit');
  const release = path.resolve(pending.release);
  if (!release.startsWith(path.join(root, 'releases') + path.sep)) throw new Error('Invalid frontend release');
  // Both sides use the same immutable commit even if master advances during the build.
  await run(process.execPath, [path.join(scripts, 'deploy-backend.mjs')], scripts, { ...process.env, COUPLE_DEPLOY_COMMIT: pending.commit });
  await withLock('frontend', async () => {
    const file = path.join(root, 'state/frontend.json');
    const previous = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null);
    await publishFrontend(release);
    const result = { ...pending, release, previousRelease: previous?.release ?? null, updatedAt: new Date().toISOString() };
    await fs.writeFile(file, JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(root, 'state/deployment.json'), JSON.stringify({ commit: pending.commit, updatedAt: result.updatedAt }, null, 2));
    console.log(`Frontend and backend deployed from master: ${pending.commit}`);
  });
});
