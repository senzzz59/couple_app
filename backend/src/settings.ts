import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db, schema } from './db/index.ts';
import { broadcast } from './realtime.ts';

/**
 * 两个人共用的自定义设置。每个键都有自己的格式校验；没设置过的键不返回，前端用默认值。
 */
export const SETTINGS = {
  /** 待办分类 */
  todoCategories: z.array(z.string().trim().min(1, '分类名不能为空').max(10, '分类名最多 10 个字')).max(30, '最多 30 个分类').transform((l) => [...new Set(l)]),
  /** 纪念日、节日、在一起天数、时光胶囊的提醒时间（HH:MM） */
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式不对'),
};
export type SettingKey = keyof typeof SETTINGS;

export async function settingsRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  app.get('/api/settings', auth, async () => {
    const rows = await db.select().from(schema.sharedSettings);
    return Object.fromEntries(rows.filter((r) => r.key in SETTINGS).map((r) => [r.key, r.value]));
  });

  app.put('/api/settings/:key', auth, async (req, reply) => {
    const key = (req.params as { key: string }).key;
    if (!(key in SETTINGS)) return reply.code(404).send({ message: '没有这个设置' });
    const value = SETTINGS[key as SettingKey].parse((req.body as { value?: unknown })?.value);
    const [prev] = await db.select().from(schema.sharedSettings).where(eq(schema.sharedSettings.key, key));
    if (prev) await db.update(schema.sharedSettings).set({ value }).where(eq(schema.sharedSettings.key, key));
    else await db.insert(schema.sharedSettings).values({ key, value });
    broadcast({ type: 'change', collection: 'settings', by: req.user.sub });
    return { [key]: value };
  });
}
