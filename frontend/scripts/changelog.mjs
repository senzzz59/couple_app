import { execFileSync } from 'node:child_process';

/**
 * 更新记录（frontend/src/data/changelog.json）和版本号的对应关系。
 * 网页构建（关于页面显示每条记录的版本）和部署通知邮件（这次部署带来了哪些更新）共用。
 *
 * 版本号规则和网页版一致：主.次 来自 frontend/app.json，第三位是提交数。
 * 一条记录的版本 = 第一次出现这条记录的那个 master 提交（功能合并）的版本；记录里写了 version 的以它为准。
 */
export const CHANGELOG_PATH = 'frontend/src/data/changelog.json';

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }).toString().trim();
  } catch {
    return '';
  }
};

/** 某个提交里的更新记录；没有这个文件时返回空列表 */
export function releasesAt(repo, rev) {
  const text = git(repo, ['show', `${rev}:${CHANGELOG_PATH}`]);
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    return Array.isArray(data.releases) ? data.releases.filter((r) => r && typeof r.id === 'string') : [];
  } catch {
    return [];
  }
}

/** 某个提交对应的版本号 */
export function versionAt(repo, rev) {
  let major = '1';
  let minor = '0';
  try {
    const { expo } = JSON.parse(git(repo, ['show', `${rev}:frontend/app.json`]));
    [major = '1', minor = '0'] = String(expo.version).split('.');
  } catch {}
  const count = git(repo, ['rev-list', '--count', rev]);
  return /^\d+$/.test(count) ? `${major}.${minor}.${count}` : null;
}

/** 每条记录的版本号：id → 版本 */
export function releaseVersions(repo, head = 'HEAD') {
  const versions = new Map();
  // 改过更新记录的 master 提交（只沿着主线走，功能分支里的提交不算），从旧到新
  const commits = git(repo, ['rev-list', '--first-parent', '--reverse', head, '--', CHANGELOG_PATH]).split('\n').filter(Boolean);
  for (const c of commits) {
    const before = new Set(releasesAt(repo, `${c}^1`).map((r) => r.id));
    const version = versionAt(repo, c);
    for (const r of releasesAt(repo, c)) if (!before.has(r.id) && !versions.has(r.id) && version) versions.set(r.id, version);
  }
  for (const r of releasesAt(repo, head)) if (r.version) versions.set(r.id, r.version);
  return versions;
}

const patch = (v) => Number(String(v ?? '').split('.')[2]);

/** 两次部署之间新增的更新记录（带版本号），新的在前 */
export function newReleases(repo, previous, current) {
  const known = new Set(previous ? releasesAt(repo, previous).map((r) => r.id) : []);
  const versions = releaseVersions(repo, current);
  // 上次部署时还没有的记录，而且版本比上次部署新（补写的旧版本记录不算这次的）
  const since = previous ? patch(versionAt(repo, previous)) : NaN;
  const list = releasesAt(repo, current).filter((r) => {
    if (known.has(r.id)) return false;
    const v = patch(versions.get(r.id) ?? r.version);
    return !Number.isFinite(since) || !Number.isFinite(v) || v > since;
  });
  // 第一次部署（不知道上次是哪个版本）只带最新的一条，不把整份历史都发出来
  return (previous ? list : list.slice(0, 1)).map((r) => ({ ...r, version: versions.get(r.id) ?? r.version ?? null }));
}
