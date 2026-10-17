import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const root = path.resolve(process.env.COUPLE_APP_ROOT || '/www/couple-app');
export const repository = path.join(root, 'repo');
export const webRoot = path.resolve(process.env.COUPLE_WEB_ROOT || '/www/wwwroot/couple.senfoundry.com');

export function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      const hint = code === 137 || signal === 'SIGKILL' ? '；进程被强制结束，请检查 free -h、swapon --show 和内核 OOM 日志' : '';
      reject(new Error(`${command} exited ${code ?? signal}${hint}`));
    });
  });
}

export async function capture(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited ${code}`)));
  });
}

// Finds a working Docker Compose: the v2 plugin (`docker compose`) or the standalone `docker-compose`.
// Without the plugin, `docker compose -p` fails as "unknown shorthand flag: 'p'", so check first.
export async function findCompose(probe = (command, args) => new Promise((resolve) => {
  const child = spawn(command, args, { stdio: 'ignore' });
  child.on('error', () => resolve(false));
  child.on('exit', (code) => resolve(code === 0));
})) {
  if (await probe('docker', ['compose', 'version'])) return ['docker', 'compose'];
  if (await probe('docker-compose', ['version'])) return ['docker-compose'];
  throw new Error('未找到 Docker Compose：请安装 Compose v2 插件（如 apt install docker-compose-plugin，或在宝塔 Docker 管理中安装 Compose），安装后 `docker compose version` 应能输出版本');
}

export async function withLock(kind, action) {
  if (process.platform !== 'linux' || Number(process.versions.node.split('.')[0]) < 24) throw new Error('Deployment requires Linux and Node.js 24+');
  const state = path.join(root, 'state');
  await fs.mkdir(state, { recursive: true });
  const lockPath = path.join(state, `${kind}.lock`);
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await fs.readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`Invalid lock file: ${lockPath}`);
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e; }
    if (alive) throw new Error(`${kind} deployment is already running`);
    await fs.unlink(lockPath);
    lock = await fs.open(lockPath, 'wx');
  }
  await lock.writeFile(String(process.pid));
  try { return await action(); }
  finally { await lock.close(); await fs.unlink(lockPath); }
}

export async function checkout(kind) {
  await run('git', ['fetch', 'origin', 'master'], repository);
  const commit = process.env.COUPLE_DEPLOY_COMMIT || await capture('git', ['rev-parse', 'origin/master'], repository);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid master commit');
  await run('git', ['cat-file', '-e', `${commit}^{commit}`], repository);
  const id = `${kind}-${commit.slice(0, 12)}-${Date.now()}`;
  const worktree = path.join(root, 'builds', id);
  await fs.mkdir(path.dirname(worktree), { recursive: true });
  await run('git', ['worktree', 'add', '--detach', worktree, commit], repository);
  return { commit, id, worktree };
}

export async function publishFrontend(release, { link = webRoot, io = fs } = {}) {
  if (!path.isAbsolute(link) || link === path.parse(link).root || link === root || link === repository) throw new Error('Invalid website root');
  const temporary = `${link}.next-${process.pid}-${Date.now()}`;
  const backup = `${link}.backup-${Date.now()}`;
  await io.mkdir(path.dirname(link), { recursive: true });
  const existing = await io.lstat(link).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && !existing.isSymbolicLink() && !existing.isDirectory()) throw new Error('Website root is not a directory');
  await io.symlink(release, temporary, 'dir');
  let moved = false;
  try {
    if (existing?.isDirectory() && !existing.isSymbolicLink()) {
      await io.rename(link, backup);
      moved = true;
    }
    await io.rename(temporary, link);
    if (moved) console.log(`Previous website directory preserved at ${backup}`);
  } catch (error) {
    if (moved) await io.rename(backup, link);
    await io.unlink(temporary).catch(() => {});
    throw error;
  }
}
