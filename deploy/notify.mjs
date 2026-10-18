import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { newReleases, versionAt } from '../frontend/scripts/changelog.mjs';

/** 读 shared/backend.env（简单的 KEY=VALUE） */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** 部署通知的内容：版本号、提交、这次新增的更新记录 */
export function deployNotice(repository, previous, commit, now = Date.now()) {
  return {
    ts: String(now),
    commit,
    version: versionAt(repository, commit),
    releases: newReleases(repository, previous, commit).map((r) => ({ version: r.version ?? null, date: String(r.date ?? ''), title: String(r.title ?? ''), changes: Array.isArray(r.changes) ? r.changes : [] })),
  };
}

export const signNotice = (secret, ts, commit) => createHmac('sha256', secret).update(`deploy-notify.${ts}.${commit}`).digest('hex');

/**
 * 部署成功后请后端发通知邮件（后端用 backend.env 里的 SMTP 和 DEPLOY_NOTIFY_EMAIL）。
 * 发不出去只记日志，不影响部署结果。
 */
export async function notifyDeploy({ root, repository, previous, commit, fetchImpl = fetch, log = console.log }) {
  try {
    const env = parseEnv(await fs.readFile(path.join(root, 'shared/backend.env'), 'utf8'));
    if (!env.JWT_SECRET) return log('Deploy notification skipped: JWT_SECRET missing');
    const notice = deployNotice(repository, previous, commit);
    const res = await fetchImpl('http://127.0.0.1:8787/internal/deploy-notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-deploy-signature': signNotice(env.JWT_SECRET, notice.ts, commit) },
      body: JSON.stringify(notice),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    log(res.ok ? `Deploy notification: ${data.sent ? `sent to ${data.to?.join(', ')}` : `not sent (${data.reason ?? 'SMTP not configured'})`}` : `Deploy notification failed: ${res.status} ${data.message ?? ''}`);
  } catch (error) {
    log(`Deploy notification failed: ${error.message}`);
  }
}
