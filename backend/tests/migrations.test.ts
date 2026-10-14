import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { pendingMigrations } from '../src/db/migrationPlan.ts';
import { databaseUrlFrom } from '../src/databaseConfig.ts';

const migrations = [{ folderMillis: 100, hash: 'first' }, { folderMillis: 200, hash: 'second' }];

test('new databases initialize all migrations and repeat deployments apply none twice', () => {
  assert.deepEqual(pendingMigrations(migrations, []), migrations);
  assert.deepEqual(pendingMigrations(migrations, [{ created_at: '100', hash: 'first' }]), [migrations[1]]);
  assert.deepEqual(pendingMigrations(migrations, [{ created_at: 100, hash: 'first' }, { created_at: 200, hash: 'second' }]), []);
});

test('published migration changes, missing files and gaps block migration', () => {
  assert.throws(() => pendingMigrations(migrations, [{ created_at: 100, hash: 'changed' }]), /被修改/);
  assert.throws(() => pendingMigrations(migrations, [{ created_at: 50, hash: 'missing' }]), /丢失/);
  assert.throws(() => pendingMigrations(migrations, [{ created_at: 200, hash: 'second' }]), /不完整/);
});

test('an older compatible application can start after a later migration was applied', () => {
  assert.deepEqual(pendingMigrations(migrations, [{ created_at: 100, hash: 'first' }, { created_at: 200, hash: 'second' }, { created_at: 300, hash: 'later' }]), []);
});

test('database config defaults to the existing couple database and encodes credentials', () => {
  const url = new URL(databaseUrlFrom({ DB_PASSWORD: 'test@:/?# value' }));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/couple');
  assert.equal(url.username, 'couple');
  assert.equal(decodeURIComponent(url.password), 'test@:/?# value');
  assert.throws(() => databaseUrlFrom({}), /DB_PASSWORD/);
  assert.equal(databaseUrlFrom({ DATABASE_URL: 'mysql://test:test@localhost/alternate' }), 'mysql://test:test@localhost/alternate');
});

test('deployment detects a schema edit whose SQL migration was not committed', async () => {
  const root = process.cwd();
  const prefix = path.join(root, 'migration-test-');
  const fixture = await fs.mkdtemp(prefix);
  try {
    await fs.cp(path.join(root, 'src'), path.join(fixture, 'src'), { recursive: true });
    await fs.cp(path.join(root, 'drizzle'), path.join(fixture, 'drizzle'), { recursive: true });
    await fs.mkdir(path.join(fixture, 'scripts'));
    await fs.copyFile(path.join(root, 'scripts/check-migrations.mjs'), path.join(fixture, 'scripts/check-migrations.mjs'));
    await fs.symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const schema = path.join(fixture, 'src/db/schema.ts');
    const source = await fs.readFile(schema, 'utf8');
    const changed = source.replace("email: varchar('email', { length: 191 }).notNull().unique(),", "email: varchar('email', { length: 191 }).notNull().unique(),\n  migrationProbe: varchar('migration_probe', { length: 20 }),");
    assert.notEqual(changed, source);
    await fs.writeFile(schema, changed);
    const result = spawnSync(process.execPath, [path.join(fixture, 'scripts/check-migrations.mjs')], { cwd: fixture, encoding: 'utf8', timeout: 40_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /迁移文件未提交/);
  } finally {
    if (!path.resolve(fixture).startsWith(prefix)) throw new Error('Invalid test cleanup path');
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
