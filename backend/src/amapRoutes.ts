import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveAmapUrl, validAmapUrl } from './amap.ts';

export async function amapRoutes(app: FastifyInstance) {
  const body = z.object({ shareText: z.string().max(10000).optional(), url: z.string().max(2000).refine(validAmapUrl, '请粘贴高德地图的地点分享链接') });
  app.post('/api/amap/resolve', { preHandler: app.authenticate }, async (req) => {
    const { url, shareText } = body.parse(req.body);
    return resolveAmapUrl(url, fetch, shareText);
  });
}
