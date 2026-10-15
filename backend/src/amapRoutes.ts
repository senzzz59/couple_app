import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseAmapPoiId, resolveAmapUrl, validAmapUrl } from './amap.ts';
import { amapService, AmapServiceError } from './amapService.ts';

const key = z.string().max(200).optional();
const position = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const poiId = z.string().regex(/^[a-zA-Z0-9]{6,40}$/);
export async function amapRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const service = (clientKey?: string) => amapService(process.env.AMAP_WEB_SERVICE_KEY || process.env.EXPO_PUBLIC_AMAP_KEY || clientKey || '');
  app.post('/api/amap/resolve', auth, async (req) => {
    const { url, shareText, key: clientKey } = z.object({ key, shareText: z.string().max(10000).optional(), url: z.string().max(2000).refine(validAmapUrl, '请粘贴高德地图的地点分享链接') }).parse(req.body);
    const result = await resolveAmapUrl(url, fetch, shareText);
    const place = result.poiId ? await service(clientKey).detail(result.poiId).catch(() => null) : null;
    return { ...result, place };
  });
  app.post('/api/amap/search', auth, async (req) => {
    const body = z.object({ query: z.string().trim().min(2).max(80), city: z.string().max(40).default(''), key }).parse(req.body);
    try { return { places: await service(body.key).search(body.query, body.city) }; }
    catch (error) { if (error instanceof AmapServiceError) return { places: [], message: error.message }; throw error; }
  });
  app.post('/api/amap/details', auth, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const body = z.object({ poiId: poiId.optional(), url: z.string().max(2000).refine(validAmapUrl).optional(), key }).parse(req.body);
    let id = body.poiId || (body.url ? parseAmapPoiId(body.url) : null);
    if (!id && body.url) id = (await resolveAmapUrl(body.url)).poiId;
    const checkedAt = new Date().toISOString();
    if (!id) return { place: null, checkedAt, message: '还没有关联到具体门店，搜索并选择分店即可查看实时信息' };
    try { return { place: await service(body.key).detail(id), checkedAt }; }
    catch (error) { if (error instanceof AmapServiceError) return { place: null, checkedAt, message: error.message }; throw error; }
  });
  app.post('/api/amap/journey', auth, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const body = z.object({ origin: position, destination: position, city: z.string().max(40).default(''), destinationCity: z.string().max(40).default(''), key }).parse(req.body);
    const provider = service(body.key);
    const city = body.city || await provider.cityAt(body.origin).catch(() => '');
    return { options: await provider.journey(body.origin, body.destination, city, body.destinationCity), checkedAt: new Date().toISOString() };
  });
}
