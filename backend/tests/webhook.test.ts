import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createWebhookServer, validateWebhook } from '../../deploy/webhook.mjs';

const secret = 'a'.repeat(64);
const payload = { repository: { full_name: 'senzzz59/couple_app' }, ref: 'refs/heads/master', after: 'b'.repeat(40) };

function headers(rawBody: Buffer, event = 'push', key = secret) {
  return { 'content-type': 'application/json', 'x-github-event': event, 'x-hub-signature-256': `sha256=${createHmac('sha256', key).update(rawBody).digest('hex')}` };
}

function validate(body: object, event = 'push') {
  const raw = Buffer.from(JSON.stringify(body));
  return validateWebhook(headers(raw, event), raw, secret);
}

test('only authenticated master pushes from the intended repository deploy', () => {
  assert.equal(validate(payload).status, 202);
  assert.equal(validate({ ...payload, ref: 'refs/heads/dev' }).status, 200);
  assert.equal(validate({ ...payload, ref: 'refs/tags/master' }).status, 200);
  assert.equal(validate({ ...payload, repository: { full_name: 'someone/another' } }).status, 200);
  assert.equal(validate({ ...payload, repository: { full_name: 'sensnow/couple_web' } }).status, 200);
  assert.equal(validate(payload, 'pull_request').status, 200);
  assert.equal(validate(payload, '').status, 200);
  assert.equal(validate({ ...payload, deleted: true }).status, 200);
  assert.equal(validate({ ...payload, after: '0'.repeat(40) }).status, 200);
  assert.equal(validate({ ...payload, after: 'master; dangerous' }).status, 200);
  assert.equal(validate({ ...payload, after: undefined }).status, 200);
});

test('GitHub signatures authenticate the exact original UTF-8 request bytes', () => {
  const raw = Buffer.from(JSON.stringify({ ...payload, head_commit: { message: '更新情侣网页 💕' } }, null, 2) + '\n');
  assert.equal(validateWebhook(headers(raw), raw, secret).status, 202);
  assert.equal(validateWebhook(headers(raw), Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), secret).status, 401);
  assert.equal(validateWebhook(headers(raw), Buffer.concat([raw, Buffer.from(' ')]), secret).status, 401);
  assert.equal(validateWebhook(headers(raw, 'push', 'wrong'.repeat(16)), raw, secret).status, 401);
});

test('missing, malformed, legacy and invalid signatures never authenticate', () => {
  const raw = Buffer.from(JSON.stringify({ ...payload, password: secret }));
  const signed = headers(raw);
  assert.equal(validateWebhook({}, raw, secret).status, 401);
  assert.equal(validateWebhook({ 'x-gitee-token': secret, 'x-gitee-event': 'Push Hook' }, raw, secret).status, 401);
  assert.equal(validateWebhook({ 'x-hub-signature': 'sha1=' + 'b'.repeat(40) }, raw, secret).status, 401);
  for (const signature of ['', 'sha256=bad', 'sha256=' + 'z'.repeat(64), 'sha256=' + '0'.repeat(64), [signed['x-hub-signature-256']]]) {
    assert.equal(validateWebhook({ ...signed, 'x-hub-signature-256': signature }, raw, secret).status, 401);
  }
  assert.equal(validateWebhook(signed, raw, 'short').status, 401);
  assert.equal(validateWebhook(signed, payload, secret).status, 401);
});

test('authenticated GitHub setup pings are acknowledged without queuing a deployment', () => {
  assert.deepEqual(validate({ repository: payload.repository, zen: 'Hello' }, 'ping'), { status: 200, message: 'pong' });
  assert.equal(validate({ repository: { full_name: 'another/repo' } }, 'ping').message, 'ignored');
});

test('invalid JSON and non-object payloads are rejected after signature validation', () => {
  for (const input of ['{', 'null', '[]', '"text"', '42']) {
    const raw = Buffer.from(input);
    assert.equal(validateWebhook(headers(raw), raw, secret).status, 400);
    assert.equal(validateWebhook({}, raw, secret).status, 401);
  }
});

test('webhooks respond immediately and coalesce queued events without concurrent deployments', async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const finishes: (() => void)[] = [];
  const server = createWebhookServer({ secret, deploy: () => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    return new Promise<void>((resolve) => finishes.push(() => { active--; resolve(); }));
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const send = (body: object, signatureSecret = secret) => {
    const raw = Buffer.from(JSON.stringify(body));
    return fetch(`http://127.0.0.1:${address.port}/webhooks/github`, { method: 'POST', headers: headers(raw, 'push', signatureSecret), body: raw });
  };
  try {
    assert.equal((await send(payload)).status, 202);
    assert.equal((await send(payload)).status, 202);
    assert.equal((await send(payload)).status, 202);
    assert.equal(calls, 1);
    finishes.shift()!();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    assert.equal(maxActive, 1);
    finishes.shift()!();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await send(payload, 'invalid')).status, 401);
    assert.equal(calls, 2);
  } finally { server.close(); server.closeAllConnections(); }
});

test('HTTP endpoint authenticates raw bytes, handles ping, and rejects legacy tokens and oversized requests', async () => {
  let deployments = 0;
  const server = createWebhookServer({ secret, deploy: async () => { deployments++; } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const raw = Buffer.from(JSON.stringify(payload, null, 2) + '\n');
  try {
    assert.equal((await fetch(base + '/webhooks/github')).status, 404);
    assert.equal((await fetch(base + '/unknown', { method: 'POST' })).status, 404);
    const ping = await fetch(base + '/webhooks/github', { method: 'POST', headers: headers(raw, 'ping'), body: raw });
    assert.equal(ping.status, 200);
    assert.deepEqual(await ping.json(), { message: 'pong' });
    assert.equal(deployments, 0);
    for (const route of ['/webhooks/github', '/webhooks/gitee']) {
      const response = await fetch(base + route, { method: 'POST', headers: headers(raw), body: raw });
      assert.equal(response.status, 202);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      await response.text();
    }
    assert.equal(deployments, 2);
    const tampered = await fetch(base + '/webhooks/github', { method: 'POST', headers: headers(raw), body: Buffer.concat([raw, Buffer.from(' ')]) });
    assert.equal(tampered.status, 401);
    const malformed = Buffer.from('{');
    assert.equal((await fetch(base + '/webhooks/github', { method: 'POST', headers: headers(malformed), body: malformed })).status, 400);
    const legacy = await fetch(base + '/webhooks/gitee', { method: 'POST', headers: { 'x-gitee-token': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, password: secret }) });
    assert.equal(legacy.status, 401);
    const oversized = Buffer.alloc(1024 * 1024 + 1, ' ');
    assert.equal((await fetch(base + '/webhooks/github', { method: 'POST', headers: headers(oversized), body: oversized })).status, 413);
    assert.equal(deployments, 2);
  } finally { server.close(); server.closeAllConnections(); }
});
