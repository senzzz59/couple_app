import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../env.ts';
import * as schema from './schema.ts';

export const pool = mysql.createPool({ uri: env.databaseUrl, timezone: 'Z', connectionLimit: 10, charset: 'utf8mb4' });
// 驱动按 UTC 解析时间，会话时区也必须是 UTC，否则 TIMESTAMP 列会差出服务器时区的小时数
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});
export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
