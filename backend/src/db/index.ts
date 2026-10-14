import { drizzle } from 'drizzle-orm/mysql2';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../env.ts';
import * as schema from './schema.ts';
import { pendingMigrations } from './migrationPlan.ts';
import { applyMigrations, mysqlFamily } from './mysqlCompatibility.ts';

export const pool = mysql.createPool({ uri: env.databaseUrl, timezone: 'Z', connectionLimit: 10, charset: 'utf8mb4' });
// 驱动按 UTC 解析时间，会话时区也必须是 UTC，否则 TIMESTAMP 列会差出服务器时区的小时数
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});
export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function runMigrations({ beforeApply }: { beforeApply?: (family: '5.7' | '8+') => Promise<void> } = {}) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [lock] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('couple_schema_migrations', 60) AS acquired");
    if (lock[0].acquired !== 1) throw new Error('另一个数据库迁移正在执行，请稍后重试');
    locked = true;
    const [version] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version');
    const family = mysqlFamily(String(version[0].version));
    const [exists] = await connection.query<RowDataPacket[]>("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'");
    const [history] = exists.length ? await connection.query<RowDataPacket[]>('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at') : [[]];
    const migrations = readMigrationFiles({ migrationsFolder });
    const pending = pendingMigrations(migrations, history as { hash: string; created_at: number | string }[]);
    if (!pending.length) return;
    if (beforeApply) await beforeApply(family);
    console.log(`Applying ${pending.length} database migration(s)`);
    await applyMigrations(pending, family, (statement, parameters) => connection.query(statement, parameters));
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('couple_schema_migrations')").catch(() => {});
    connection.release();
  }
}
