import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pool, runMigrations } from '../src/db/index.ts';
import { env } from '../src/env.ts';

async function backup(family: '5.7' | '8+') {
  const url = new URL(env.databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error('数据库连接缺少库名');
  const folder = path.resolve(process.env.DATABASE_BACKUP_DIR || '/www/couple-app/shared/backups');
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `before-migration-${Date.now()}.sql`;
  const image = family === '5.7' ? 'mysql:5.7.44' : 'mysql:8.4';
  const args = ['run', '--rm', '--network', 'host', '--env', 'MYSQL_PWD', '--mount', `type=bind,src=${folder},dst=/backup`, image,
    'mysqldump', `--host=${url.hostname}`, `--port=${url.port || '3306'}`, `--user=${decodeURIComponent(url.username)}`, '--default-character-set=utf8mb4', '--single-transaction', '--no-tablespaces', '--set-gtid-purged=OFF',
    ...(family === '5.7' ? [] : ['--column-statistics=0']), `--result-file=/backup/${name}`, '--databases', database];
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', args, { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    child.stderr.on('data', (data) => { errorOutput = (errorOutput + data).slice(-8000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`数据库备份失败，迁移未执行：${errorOutput}`)));
  });
  const file = path.join(folder, name);
  if (!(await fs.stat(file)).size) throw new Error('数据库备份为空，迁移未执行');
  await fs.chmod(file, 0o600);
  console.log(`Database backup saved: ${file}`);
}

try {
  await runMigrations({ beforeApply: backup });
  console.log('Database migrations ready');
} finally { await pool.end(); }
