import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createWebhookServer, validateWebhook } from '../../deploy/webhook.mjs';

const secret = 'a'.repeat(64);
const payload = { password: secret, hook_name: 'push_hooks', repository: { full_name: 'sensnow/couple_web' }, ref: 'refs/heads/master', after: 'b'.repeat(40) };

test('only authenticated master pushes from the intended repository deploy', () => {
  assert.equal(validateWebhook({}, payload, secret).status, 202);
  assert.equal(validateWebhook({ 'x-gitee-token': secret, 'x-gitee-event': 'Push Hook' }, { ...payload, password: undefined }, secret).status, 202);
  assert.equal(validateWebhook({}, { ...payload, password: 'wrong' }, secret).status, 401);
  assert.equal(validateWebhook({}, { ...payload, ref: 'refs/heads/dev' }, secret).status, 200);
  assert.equal(validateWebhook({}, { ...payload, repository: { full_name: 'someone/another' } }, secret).status, 200);
  assert.equal(validateWebhook({}, { ...payload, hook_name: 'Tag Push' }, secret).status, 200);
  assert.equal(validateWebhook({}, { ...payload, deleted: true }, secret).status, 200);
  assert.equal(validateWebhook({}, { ...payload, after: '0'.repeat(40) }, secret).status, 200);
  assert.equal(validateWebhook({}, { ...payload, after: 'master; dangerous' }, secret).status, 200);
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
  const send = (body: object) => fetch(`http://127.0.0.1:${address.port}/webhooks/gitee`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
    assert.equal((await send({ ...payload, password: 'invalid' })).status, 401);
    assert.equal(calls, 2);
  } finally { server.close(); server.closeAllConnections(); }
});
