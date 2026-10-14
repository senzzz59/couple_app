import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'couple-migrations-'));
try {
  const output = path.join(temporary, 'drizzle');
  await fs.cp(path.join(root, 'drizzle'), output, { recursive: true });
  const before = new Set((await fs.readdir(output)).filter((name) => name.endsWith('.sql')));
  const config = path.join(temporary, 'drizzle.config.ts');
  await fs.writeFile(config, `export default ${JSON.stringify({ dialect: 'mysql', schema: path.join(root, 'src/db/schema.ts').split(path.sep).join('/'), out: './drizzle' })};\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/drizzle-kit/bin.cjs'), 'generate', `--config=${config}`, '--name=uncommitted_schema_change'], { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] });
    let detail = '';
    child.stdout.on('data', (data) => { detail = (detail + data).slice(-8000); });
    child.stderr.on('data', (data) => { detail = (detail + data).slice(-8000); });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      // drizzle-kit can report a schema-loading error while exiting with code 0.
      const completed = /No schema changes|Your SQL migration file/.test(detail);
      code === 0 && completed ? resolve() : reject(new Error(`迁移检查未完成，请先生成并提交迁移文件。${detail}`));
    });
  });
  if ((await fs.readdir(output)).some((name) => name.endsWith('.sql') && !before.has(name))) throw new Error('表结构已修改但迁移文件未提交：请运行 npm run db:generate，并提交 drizzle/ 中的新迁移');
  console.log('Schema matches committed migrations');
} finally {
  if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('couple-migrations-')) throw new Error('Invalid migration check cleanup path');
  await fs.rm(temporary, { recursive: true, force: true });
}
