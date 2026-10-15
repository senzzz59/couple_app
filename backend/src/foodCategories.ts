import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from './db/index.ts';

interface CategoryStore {
  read(userId: string): Promise<string[] | null>;
  write(userId: string, categories: string[]): Promise<void>;
}
const categoryStore: CategoryStore = {
  async read(userId) {
    const [row] = await db.select().from(schema.foodPreferences).where(eq(schema.foodPreferences.userId, userId));
    return row?.categories ?? null;
  },
  async write(userId, categories) {
    await db.insert(schema.foodPreferences).values({ userId, categories })
      .onDuplicateKeyUpdate({ set: { categories } });
  },
};

export async function foodCategoryRoutes(app: FastifyInstance, options: { store?: CategoryStore } = {}) {
  const store = options.store ?? categoryStore;
  const auth = { preHandler: app.authenticate };
  app.get('/api/food-categories', auth, async (req) => {
    return { categories: await store.read(req.user.sub) };
  });
  app.put('/api/food-categories', auth, async (req) => {
    const { categories } = z.object({ categories: z.array(z.string().trim().min(1).max(20)).max(100) }).parse(req.body);
    const unique = [...new Set(categories)];
    await store.write(req.user.sub, unique);
    return { categories: unique };
  });
}
