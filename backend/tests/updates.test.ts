import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUpdateController } from '../../frontend/src/lib/updateController.ts';

test('concurrent checks share one download and installation requires a downloaded update', async () => {
  let checks = 0;
  let downloads = 0;
  let reloads = 0;
  let resolveCheck!: (value: { isAvailable: boolean }) => void;
  const controller = createUpdateController({
    enabled: () => true,
    check: () => { checks++; return new Promise((resolve) => { resolveCheck = resolve; }); },
    fetch: async () => { downloads++; return { isNew: true }; },
    reload: async () => { reloads++; },
  });
  assert.equal(await controller.install(), false);
  const first = controller.check();
  const second = controller.check(true);
  assert.equal(first, second);
  resolveCheck({ isAvailable: true });
  assert.equal(await first, true);
  assert.equal(controller.getState().phase, 'ready');
  assert.equal(reloads, 0, 'downloading in the foreground does not restart the app');
  await Promise.all([controller.install(), controller.install()]);
  assert.deepEqual([checks, downloads, reloads], [1, 1, 1]);
});

test('automatic checks are throttled while manual checks and error retries still work', async () => {
  let time = 1000;
  let calls = 0;
  const controller = createUpdateController({
    enabled: () => true,
    check: async () => { calls++; if (calls === 1) throw new Error('offline'); return { isAvailable: false }; },
    fetch: async () => { throw new Error('unexpected download'); },
    reload: async () => { throw new Error('unexpected reload'); },
  }, () => time);
  await controller.check();
  assert.equal(controller.getState().phase, 'error');
  await controller.check();
  assert.equal(calls, 1);
  await controller.check(true);
  assert.equal(calls, 2);
  assert.equal(controller.getState().error, null);
  time += 15 * 60_000;
  await controller.check();
  assert.equal(calls, 3);
});

test('failed downloads do not restart and can be retried', async () => {
  let fail = true;
  const controller = createUpdateController({
    enabled: () => true,
    check: async () => ({ isAvailable: true }),
    fetch: async () => { if (fail) throw new Error('network'); return { isNew: true }; },
    reload: async () => { throw new Error('must not be called'); },
  });
  assert.equal(await controller.check(true), false);
  assert.equal(controller.getState().pending, false);
  assert.equal(await controller.install(), false);
  fail = false;
  assert.equal(await controller.check(true), true);
});

test('rollback directives download and reload failures retain a retryable pending update', async () => {
  let fail = true;
  const controller = createUpdateController({
    enabled: () => true,
    check: async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
    fetch: async () => ({ isNew: false, isRollBackToEmbedded: true }),
    reload: async () => { if (fail) throw new Error('reload failed'); },
  });
  assert.equal(await controller.check(true), true);
  assert.equal(await controller.install(), false);
  assert.equal(controller.getState().phase, 'ready');
  assert.equal(controller.getState().pending, true);
  fail = false;
  assert.equal(await controller.install(), true);
});

test('unsupported environments make no native update calls', async () => {
  const controller = createUpdateController({
    enabled: () => false,
    check: async () => { throw new Error('must not be called'); },
    fetch: async () => { throw new Error('must not be called'); },
    reload: async () => { throw new Error('must not be called'); },
  });
  assert.equal(await controller.check(true), false);
  assert.equal(controller.getState().phase, 'unsupported');
});
