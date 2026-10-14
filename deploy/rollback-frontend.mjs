import fs from 'node:fs/promises';
import path from 'node:path';
import { root, withLock, publishFrontend } from './release-utils.mjs';

await withLock('frontend', async () => {
  const file = path.join(root, 'state/frontend.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!state.previousRelease) throw new Error('No previous frontend release');
  const target = path.resolve(state.previousRelease);
  if (!target.startsWith(path.join(root, 'releases') + path.sep)) throw new Error('Invalid rollback directory');
  await fs.access(path.join(target, 'index.html'));
  await publishFrontend(target);
  await fs.writeFile(file, JSON.stringify({ ...state, commit: null, release: target, previousRelease: state.release, updatedAt: new Date().toISOString() }, null, 2));
  console.log('Previous frontend release restored');
});
