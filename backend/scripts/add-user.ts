// 添加账号 / 重置密码（新账号登录后自己创建空间或填邀请码配对）
// 用法：npm run user:add -- <邮箱> <密码> <昵称>
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db, pool, runMigrations, schema } from '../src/db/index.ts';

const [email, password, name = ''] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('用法：npm run user:add -- <邮箱> <密码(至少8位)> <昵称>');
  process.exit(1);
}

await runMigrations();
const passwordHash = await bcrypt.hash(password, 10);
const key = email.trim().toLowerCase();
const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, key));
if (existing) {
  await db.update(schema.users).set({ passwordHash, ...(name ? { name } : {}) }).where(eq(schema.users.id, existing.id));
  console.log(`已更新账号 ${key}`);
} else {
  await db.insert(schema.users).values({ email: key, passwordHash, name });
  console.log(`已创建账号 ${key}`);
}
await pool.end();
