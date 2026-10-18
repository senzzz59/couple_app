import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * 部署前把主克隆（部署脚本所在的目录）快进到最新的 master，部署工具的改动不用再手动 git pull。
 * 只在工作区干净、当前在 master、能快进的时候做；有本地修改或分叉就保持原样（照旧用现有脚本部署）。
 */
export async function syncDeployTools(repository, log = console.log) {
  const git = async (...args) => (await exec('git', args, { cwd: repository })).stdout.trim();
  try {
    if ((await git('rev-parse', '--abbrev-ref', 'HEAD')) !== 'master') return { updated: false, reason: 'not on master' };
    if (await git('status', '--porcelain', '--untracked-files=no')) return { updated: false, reason: 'local changes' };
    await git('fetch', 'origin', 'master');
    const before = await git('rev-parse', 'HEAD');
    await git('merge', '--ff-only', 'origin/master');
    const after = await git('rev-parse', 'HEAD');
    if (before !== after) log(`Deploy tools updated: ${before.slice(0, 7)} -> ${after.slice(0, 7)}`);
    return { updated: before !== after };
  } catch (error) {
    log(`Deploy tools not updated (${error.message.split('\n')[0]}); using current scripts`);
    return { updated: false, reason: 'git failed' };
  }
}
