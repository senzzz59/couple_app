import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { amapService, normalizeAmapPlace } from '../src/amapService.ts';
import { amapRoutes } from '../src/amapRoutes.ts';
import { parseAmapLocation, parseAmapPoiId } from '../src/amap.ts';
import { poiUrl, travelDistance, travelTime } from '../../frontend/src/lib/amapLive.ts';

const fixture = { id: 'B0TEST123', name: '小春食堂', location: '121.47,31.23', cityname: '上海市', citycode: '021', address: '小街12号', biz_ext: { rating: '4.7', cost: '88.2', opentime: '11:00-21:00' }, photos: [{ url: 'http://example.com/store.jpg', title: '门店' }, { url: 'javascript:alert(1)' }] };

test('live POIs normalize missing values, validate coordinates and allow only image URLs', () => {
  const p = normalizeAmapPlace(fixture)!;
  assert.equal(p.rating, 4.7);
  assert.equal(p.price, 88);
  assert.equal(p.hours, '11:00-21:00');
  assert.deepEqual(p.photos, [{ url: 'https://example.com/store.jpg', title: '门店' }]);
  const missing = normalizeAmapPlace({ id: 'B0TEST123', name: '店', address: [], cityname: [], location: ',NaN', biz_ext: { rating: [], cost: [] } })!;
  assert.equal(missing.rating, null); assert.equal(missing.price, null);
  assert.equal(missing.lat, null); assert.equal(missing.lng, null);
  assert.deepEqual(missing.photos, []); assert.equal(missing.address, '');
  assert.equal(normalizeAmapPlace({}), null);
});

test('modern share URLs retain exact POI identity and latitude-first coordinates', () => {
  const p = normalizeAmapPlace(fixture)!;
  const url = poiUrl(p);
  assert.equal(parseAmapPoiId(url), fixture.id);
  assert.equal(parseAmapLocation(url)?.lng, 121.47);
  assert.equal(parseAmapLocation(url)?.lat, 31.23);
  assert.equal(parseAmapPoiId('https://m.amap.com/poi/detail?poiid=../../evil'), null);
});

test('details are fetched afresh, with exact IDs and all optional fields requested', async () => {
  const urls: URL[] = [];
  const provider = amapService('test-key', (async (url, init) => {
    urls.push(new URL(String(url)));
    assert.equal(init?.redirect, 'error');
    return Response.json({ status: '1', pois: [fixture] });
  }) as typeof fetch);
  assert.equal((await provider.detail(fixture.id))?.rating, 4.7);
  await provider.detail(fixture.id);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].hostname, 'restapi.amap.com');
  assert.equal(urls[0].searchParams.get('id'), fixture.id);
  assert.equal(urls[0].searchParams.get('extensions'), 'all');
});

test('one failed travel mode does not discard the others; cross-city transit uses both cities', async () => {
  const urls: URL[] = [];
  const provider = amapService('test-key', (async (url) => {
    const u = new URL(String(url)); urls.push(u);
    if (u.pathname.endsWith('walking')) return Response.json({ status: '0', info: 'NO_ROUTE' });
    if (u.pathname.endsWith('bicycling')) return Response.json({ errcode: 0, data: { paths: [{ duration: 600, distance: 2000 }] } });
    if (u.pathname.includes('transit')) return Response.json({ status: '1', route: { transits: [{ duration: '1800', distance: '8000' }, { duration: '1500', distance: '7000' }] } });
    return Response.json({ status: '1', route: { paths: [{ duration: '900', distance: '9000' }] } });
  }) as typeof fetch);
  const result = await provider.journey({ lat: 31.12345678, lng: 121.12345678 }, { lat: 31.23, lng: 121.47 }, '021', '0512');
  assert.deepEqual(result.map((o) => o.seconds), [null, 600, 900, 1500]);
  const transit = urls.find((u) => u.pathname.includes('transit'))!;
  assert.equal(transit.searchParams.get('city'), '021');
  assert.equal(transit.searchParams.get('cityd'), '0512');
  assert.equal(transit.searchParams.get('origin'), '121.123457,31.123457');
});

test('empty routes, missing keys and upstream failures never invent times or leak keys', async () => {
  let calls = 0;
  const empty = amapService('test-key', (async () => { calls++; return Response.json({ status: '1', route: { paths: [] } }); }) as typeof fetch);
  assert.ok((await empty.journey({ lat: 31, lng: 121 }, { lat: 32, lng: 120 })).every((o) => o.seconds == null));
  assert.equal(calls, 3); // transit requires an origin city
  await assert.rejects(amapService('').detail('B0TEST123'), /暂未开启/);
  await assert.rejects(amapService('must-not-leak', (async () => { throw new Error('must-not-leak'); }) as typeof fetch).detail('B0TEST123'), (e: Error) => !e.message.includes('must-not-leak'));
  assert.equal(travelTime(null), '暂无'); assert.equal(travelTime(61), '2分钟'); assert.equal(travelTime(3600), '1小时');
  assert.equal(travelTime(3660), '1小时1分'); assert.equal(travelDistance(1250), '1.3公里');
});

test('live endpoints require authentication and reject invalid coordinates and URLs', async () => {
  const app = Fastify();
  app.decorate('authenticate', async (req, reply) => { if (!req.headers.authorization) reply.code(401).send(); });
  app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ message: 'invalid' }));
  await app.register(amapRoutes);
  try {
    for (const url of ['/api/amap/details', '/api/amap/journey', '/api/amap/search']) assert.equal((await app.inject({ method: 'POST', url, payload: {} })).statusCode, 401);
    const headers = { authorization: 'test' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/amap/journey', headers, payload: { origin: { lat: 91, lng: 121 }, destination: { lat: 31, lng: 121 } } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/amap/details', headers, payload: { url: 'http://127.0.0.1/private' } })).statusCode, 400);
    const response = await app.inject({ method: 'POST', url: '/api/amap/details', headers, payload: {} });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.json().place, null);
  } finally { await app.close(); }
});
