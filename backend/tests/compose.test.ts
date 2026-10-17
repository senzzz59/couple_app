import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCompose } from '../../deploy/release-utils.mjs';

const probeWith = (available: string[]) => async (command: string, args: string[]) => available.includes([command, ...args].join(' '));

test('prefers the Docker Compose v2 plugin', async () => {
  assert.deepEqual(await findCompose(probeWith(['docker compose version', 'docker-compose version'])), ['docker', 'compose']);
});

test('falls back to standalone docker-compose', async () => {
  assert.deepEqual(await findCompose(probeWith(['docker-compose version'])), ['docker-compose']);
});

test('explains how to install Compose when neither exists', async () => {
  await assert.rejects(findCompose(probeWith([])), /docker-compose-plugin/);
});
