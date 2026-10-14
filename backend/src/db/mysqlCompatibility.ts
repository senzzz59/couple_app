import type { MigrationMeta } from 'drizzle-orm/migrator';

// Only these immutable, published migrations require legacy MySQL 8 syntax adaptation.
const legacyHashes = new Set([
  'e9efc677ce5e2e57a3dbb97589a8c00a8d7e511b94f111ea17af1e5d4c51e83f',
  '122e1667966a1c93e21e14fd6ebc1fc6a16ebe56ac38ba1b23b27cc7534f00c3',
  '5aec14b5d0b0dee60fab4cc3cb24d696806e16564f27e6b26ef1d8bb2fca62de',
]);

export function mysqlFamily(version: string): '5.7' | '8+' {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (/mariadb/i.test(version) || !match) throw new Error('需要 MySQL 5.7.44 或 MySQL 8.0.13+');
  const [, major, minor, patch] = match.map(Number);
  if (major > 8 || (major === 8 && (minor > 0 || patch >= 13))) return '8+';
  if (major === 5 && minor === 7 && patch >= 44) return '5.7';
  throw new Error('需要 MySQL 5.7.44 或 MySQL 8.0.13+');
}

export function migrationStatements(migration: MigrationMeta, family: '5.7' | '8+') {
  if (family !== '5.7' || !legacyHashes.has(migration.hash)) return migration.sql;
  return migration.sql.map((statement) => statement
    .replace(/(\bjson\s+NOT\s+NULL)\s+DEFAULT\s+\('\[(?:0)?\]'\)/gi, '$1')
    .replace(/\bDEFAULT\s+\(now\(\)\)/gi, 'DEFAULT CURRENT_TIMESTAMP'));
}

type Execute = (statement: string, parameters?: (string | number)[]) => Promise<unknown>;

/** Use the locked connection and preserve Drizzle's original migration hashes. */
export async function applyMigrations(migrations: MigrationMeta[], family: '5.7' | '8+', execute: Execute) {
  await execute('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)');
  for (const migration of migrations) {
    for (const statement of migrationStatements(migration, family)) {
      if (statement.trim()) await execute(statement);
    }
    // Record only after all statements succeeded; never mark a partial migration complete.
    await execute('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [migration.hash, migration.folderMillis]);
  }
}
