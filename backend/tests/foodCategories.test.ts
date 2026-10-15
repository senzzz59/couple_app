import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';

// Test credentials never connect: the routes use the in-memory store below.
process.env.DATABASE_URL = 'mysql://test:test@localhost/test';
process.env.JWT_SECRET = 'test-only-not-a-production-secret';
const { foodCategoryRoutes } = await import('../src/foodCategories.ts');

test('category preferences follow the authenticated user and never a supplied owner ID', async () => {
  const rows = new Map<string, string[]>();
  const app = Fastify();
  app.decorate('authenticate', async (req, reply) => {
    const sub = req.headers['x-test-user'];
    if (typeof sub !== 'string') { reply.code(401).send(); return; }
    req.user = { sub };
  });
  await app.register(foodCategoryRoutes, { store: {
    async read(id) { return rows.get(id) ?? null; },
    async write(id, categories) { rows.set(id, categories); },
  } });
  try {
    const get = (user: string) => app.inject({ method: 'GET', url: '/api/food-categories?userId=alice', headers: { 'x-test-user': user } });
    const put = (user: string, categories: string[]) => app.inject({ method: 'PUT', url: '/api/food-categories', headers: { 'x-test-user': user }, payload: { userId: 'alice', categories } });
    assert.equal((await app.inject('/api/food-categories')).statusCode, 401);
    assert.deepEqual((await get('alice')).json(), { categories: null });
    assert.equal((await put('alice', [' 火锅 ', '私房菜', '火锅'])).statusCode, 200);
    assert.deepEqual((await get('alice')).json(), { categories: ['火锅', '私房菜'] });
    assert.deepEqual((await get('bob')).json(), { categories: null });
    await put('bob', ['咖啡']);
    await put('alice', []);
    assert.deepEqual((await get('alice')).json(), { categories: [] });
    assert.deepEqual((await get('bob')).json(), { categories: ['咖啡'] });
    assert.equal((await put('bob', [' '])).statusCode, 500); // production error handler maps Zod errors to 400
    assert.deepEqual((await get('bob')).json(), { categories: ['咖啡'] });
  } finally { await app.close(); }
});
