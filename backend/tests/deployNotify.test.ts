import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { newReleases, releaseVersions, versionAt } from '../../frontend/scripts/changelog.mjs';
import { deployNotice, notifyDeploy, parseEnv, signNotice } from '../../deploy/notify.mjs';
import { syncDeployTools } from '../../deploy/sync-tools.mjs';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function repoWithReleases() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'changelog-'));
  git(dir, 'init', '-q', '-b', 'master');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  await fs.mkdir(path.join(dir, 'frontend/src/data'), { recursive: true });
  await fs.writeFile(path.join(dir, 'frontend/app.json'), JSON.stringify({ expo: { version: '1.1.0' } }));
  const write = (releases: object[]) => fs.writeFile(path.join(dir, 'frontend/src/data/changelog.json'), JSON.stringify({ releases }));
  const commit = (msg: string) => (git(dir, 'add', '-A'), git(dir, 'commit', '-q', '-m', msg), git(dir, 'rev-parse', 'HEAD'));
  const merge = async (branch: string, releases: object[]) => {
    git(dir, 'checkout', '-q', '-b', branch);
    await write(releases);
    commit(`feature ${branch}`);
    git(dir, 'checkout', '-q', 'master');
    git(dir, 'merge', '-q', '--no-ff', branch, '-m', `合并 ${branch}`);
    return git(dir, 'rev-parse', 'HEAD');
  };
  await write([]);
  const base = commit('base');
  const a = { id: 'a', date: '2026-10-01', title: '功能 A', changes: [{ type: 'new', text: 'A' }] };
  const b = { id: 'b', date: '2026-10-02', title: '功能 B', changes: [{ type: 'fix', text: 'B' }] };
  const c = { id: 'c', date: '2026-10-03', title: '功能 C', changes: [] };
  const m1 = await merge('fa', [a]);
  const m2 = await merge('fb', [b, a]);
  const m3 = await merge('fc', [c, b, a]);
  return { dir, base, m1, m2, m3 };
}

test('each release gets the version of the master merge that added it', async () => {
  const { dir, m1, m2, m3 } = await repoWithReleases();
  const v = releaseVersions(dir, m3);
  assert.equal(v.get('a'), versionAt(dir, m1));
  assert.equal(v.get('b'), versionAt(dir, m2));
  assert.equal(v.get('c'), versionAt(dir, m3));
  assert.match(versionAt(dir, m3)!, /^1\.1\.\d+$/);
  // 两次部署之间新增的：上次部署在 m1，这次 m3 → b、c
  assert.deepEqual(newReleases(dir, m1, m3).map((r: { id: string }) => r.id), ['c', 'b']);
  assert.deepEqual(newReleases(dir, m3, m3), []);
  // 第一次部署只带最新一条
  assert.deepEqual(newReleases(dir, null, m3).map((r: { id: string }) => r.id), ['c']);
  const n = deployNotice(dir, m2, m3, 1_800_000_000_000);
  assert.equal(n.version, versionAt(dir, m3));
  assert.equal(n.releases[0].title, '功能 C');
});

test('deploy tools fast-forward only when the clone is clean and on master', async () => {
  const { dir } = await repoWithReleases();
  const clone = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-'));
  git(clone, 'clone', '-q', dir, '.');
  git(clone, 'config', 'user.email', 't@t');
  git(clone, 'config', 'user.name', 't');
  git(clone, 'reset', '-q', '--hard', 'HEAD~1');
  const logs: string[] = [];
  assert.deepEqual(await syncDeployTools(clone, (m: string) => logs.push(m)), { updated: true });
  assert.equal(git(clone, 'rev-parse', 'HEAD'), git(dir, 'rev-parse', 'master'));
  // 有本地修改：不动
  git(clone, 'reset', '-q', '--hard', 'HEAD~1');
  await fs.writeFile(path.join(clone, 'frontend/app.json'), '{"changed":true}');
  const before = git(clone, 'rev-parse', 'HEAD');
  assert.deepEqual(await syncDeployTools(clone, () => {}), { updated: false, reason: 'local changes' });
  assert.equal(git(clone, 'rev-parse', 'HEAD'), before);
});

test('deploy notification is signed with JWT_SECRET and never throws', async () => {
  const { dir, m2, m3 } = await repoWithReleases();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'root-'));
  await fs.mkdir(path.join(root, 'shared'));
  await fs.writeFile(path.join(root, 'shared/backend.env'), 'DB_PASSWORD=x\nJWT_SECRET="s3cret"\n');
  assert.deepEqual(parseEnv('A=1\nB="two words"\n# c\nC=\'3\''), { A: '1', B: 'two words', C: '3' });
  let seen: { url: string; headers: Record<string, string>; body: { ts: string; commit: string; releases: unknown[] } } | null = null;
  const fake = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ sent: true, to: ['a@b.c'] }));
  }) as unknown as typeof fetch;
  const logs: string[] = [];
  await notifyDeploy({ root, repository: dir, previous: m2, commit: m3, fetchImpl: fake, log: (m: string) => logs.push(m) });
  assert.equal(seen!.url, 'http://127.0.0.1:8787/internal/deploy-notify');
  assert.equal(seen!.headers['x-deploy-signature'], signNotice('s3cret', seen!.body.ts, m3));
  assert.equal(seen!.body.releases.length, 1);
  assert.match(logs[0], /sent to a@b.c/);
  // 后端没起来：只记日志
  const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
  await notifyDeploy({ root, repository: dir, previous: m2, commit: m3, fetchImpl: down, log: (m: string) => logs.push(m) });
  assert.match(logs.at(-1)!, /failed: ECONNREFUSED/);
});

test('backend accepts only correctly signed, recent deploy notices', async () => {
  const Fastify = (await import('fastify')).default;
  const { deployNotifyRoutes, deploySignature, recipients } = await import('../src/deployNotify.ts');
  const { deployMail } = await import('../src/mail.ts');
  const app = Fastify();
  app.setErrorHandler((e, _q, r) => r.code(400).send({ message: e.message }));
  await app.register(deployNotifyRoutes);
  const ts = String(Date.now());
  const commit = 'a'.repeat(40);
  const payload = { ts, commit, version: '1.1.60', releases: [{ version: '1.1.60', date: '2026-10-18', title: '<b>标题</b>', changes: [{ type: 'new', text: 'x & y' }] }] };
  const post = (sig: string, body = payload) => app.inject({ method: 'POST', url: '/internal/deploy-notify', headers: { 'x-deploy-signature': sig }, payload: body });
  assert.equal((await post('nope')).statusCode, 401);
  assert.equal((await post(deploySignature('wrong', ts, commit))).statusCode, 401);
  const old = String(Date.now() - 3600_000);
  assert.equal((await post(deploySignature(process.env.JWT_SECRET!, old, commit), { ...payload, ts: old })).statusCode, 401);
  const ok = await post(deploySignature(process.env.JWT_SECRET!, ts, commit));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().sent, false, 'SMTP not configured in tests');
  assert.deepEqual(recipients('a@b.com, c@d.cn；e@f.org'), ['a@b.com', 'c@d.cn', 'e@f.org']);
  assert.deepEqual(recipients('off'), []);
  const mail = deployMail({ ...payload, deployedAt: new Date().toISOString() }, 'Asia/Shanghai');
  assert.match(mail.subject, /v1\.1\.60 · <b>标题<\/b>/);
  assert.ok(mail.html.includes('&lt;b&gt;标题&lt;/b&gt;') && mail.html.includes('x &amp; y') && mail.html.includes('新功能'));
  assert.ok(mail.text.includes('[新功能] x & y'));
});
