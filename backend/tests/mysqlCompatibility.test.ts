import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/mysql2';
import { applyMigrations, migrationStatements, mysqlFamily } from '../src/db/mysqlCompatibility.ts';
import { anniversaries, capsules, moments, visits } from '../src/db/schema.ts';

test('server versions select MySQL 5.7.44 or MySQL 8+ without accepting incompatible servers', () => {
  assert.equal(mysqlFamily('5.7.44-log'), '5.7');
  assert.equal(mysqlFamily('8.0.13'), '8+');
  assert.equal(mysqlFamily('8.4.6'), '8+');
  for (const version of ['5.6.51', '5.7.43', '8.0.12', '10.11.5-MariaDB', 'unknown']) assert.throws(() => mysqlFamily(version));
});

test('all committed migrations adapt for 5.7 without changing published hashes or 8+ SQL', () => {
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
  for (const migration of migrations) {
    const original = structuredClone(migration);
    const sql = migrationStatements(migration, '5.7').join('\n');
    assert.doesNotMatch(sql, /json\s+NOT\s+NULL\s+DEFAULT|DEFAULT\s+\(now\(\)\)/i);
    assert.deepEqual(migrationStatements(migration, '8+'), original.sql);
    assert.deepEqual(migration, original);
  }
  const legacy = migrationStatements(migrations[0], '5.7').join('\n');
  assert.match(legacy, /`remind` json NOT NULL,/);
  assert.match(legacy, /DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/);
});

test('omitted JSON fields use application defaults in inserts on both database versions', () => {
  const db = drizzle.mock();
  const inserts = [
    [db.insert(anniversaries).values({ title: 'test', date: '2026-10-15' }).toSQL(), '[0]'],
    [db.insert(moments).values({ content: 'test' }).toSQL(), '[]'],
    [db.insert(visits).values({ placeId: 'place', date: '2026-10-15' }).toSQL(), '[]'],
    [db.insert(capsules).values({ title: 'test', content: 'test', unlockAt: '2026-10-15', createdBy: 'user' }).toSQL(), '[]'],
  ] as const;
  for (const [query, expected] of inserts) assert.ok(query.params.includes(expected));
  assert.ok(anniversaries.remind.defaultFn);
  assert.equal(anniversaries.remind.default, undefined);
});

test('failed SQL is never marked complete and successful SQL records the original hash', async () => {
  const migration = readMigrationFiles({ migrationsFolder: './drizzle' })[0];
  const calls: { sql: string; params?: (string | number)[] }[] = [];
  await applyMigrations([migration], '5.7', async (sql, params) => { calls.push({ sql, params }); });
  assert.deepEqual(calls.at(-1)?.params, [migration.hash, migration.folderMillis]);
  assert.match(calls[1].sql, /`remind` json NOT NULL,/);
  const failed: string[] = [];
  await assert.rejects(applyMigrations([migration], '5.7', async (sql) => {
    failed.push(sql);
    if (sql.trimStart().startsWith('CREATE TABLE `answers`')) throw new Error('DDL failed');
  }), /DDL failed/);
  assert.ok(failed.every((sql) => !sql.startsWith('INSERT INTO __drizzle_migrations')));
});
