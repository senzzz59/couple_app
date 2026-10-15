import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAmapPrice, parseAmapLocation, resolveAmapUrl, validAmapUrl } from '../src/amap.ts';
import { amapShareUrl, mapLinks, phonePlatform } from '../../frontend/src/lib/amap.ts';

test('extracts a full AMap share message and rejects lookalike hosts and credentials', () => {
  assert.equal(amapShareUrl('推荐这家店！https://surl.amap.com/abc（高德地图）'), 'https://surl.amap.com/abc');
  assert.equal(amapShareUrl('http://url.amap.com/abc'), 'https://url.amap.com/abc');
  for (const url of ['https://amap.com.evil.com/x', 'https://evilamap.com/x', 'https://amap.com@127.0.0.1/x', 'https://user@amap.com/x', 'https://amap.com:8080/x', 'file:///tmp/x']) {
    assert.equal(validAmapUrl(url), false);
    assert.equal(amapShareUrl(url), null);
  }
});

test('reads latitude-first AMap shares and longitude-first URI destinations', () => {
  const share = 'https://wb.amap.com/?p=' + encodeURIComponent('B0TEST,22.540755,113.940255,火锅店,科技路80号');
  assert.deepEqual(parseAmapLocation(share), { lat: 22.540755, lng: 113.940255, name: '火锅店', address: '科技路80号' });
  const marker = 'https://uri.amap.com/marker?position=113.940255,22.540755&name=火锅店&coordinate=gaode';
  assert.equal(parseAmapLocation(marker)?.lng, 113.940255);
  assert.equal(parseAmapLocation(marker + '&dev=1'), null);
  for (const pair of ['NaN,22', '113,NaN', '181,22', '113,91', ',22']) {
    assert.equal(parseAmapLocation(`https://uri.amap.com/marker?position=${pair}`), null);
  }
});

test('resolves a short link and reads per-person cost from its destination', async () => {
  const calls: string[] = [];
  const fetcher = (async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.redirect, 'manual');
    if (calls.length === 2) return new Response('<script>{"biz_ext":{"cost":"128.4"}}</script>');
    return new Response(null, { status: 302, headers: { location: 'https://wb.amap.com/?p=' + encodeURIComponent('B0TEST,22.54,113.94,店名,地址') } });
  }) as typeof fetch;
  const result = await resolveAmapUrl('https://surl.amap.com/test', fetcher);
  assert.equal(result.amapUrl, 'https://surl.amap.com/test');
  assert.equal(result.location?.lng, 113.94);
  assert.equal(calls.length, 2);
  assert.equal(result.price, 128);
});

test('blocked redirects, timeouts, missing data and loops preserve the original link', async () => {
  for (const target of ['http://127.0.0.1/private', 'https://amap.com.evil.com/x', 'https://amap.com:8080/x']) {
    let count = 0;
    const fetcher = (async () => { count++; return new Response(null, { status: 302, headers: { location: target } }); }) as typeof fetch;
    assert.equal((await resolveAmapUrl('https://surl.amap.com/test', fetcher)).location, null);
    assert.equal(count, 1);
  }
  const failed = await resolveAmapUrl('https://surl.amap.com/test', (async () => { throw new Error('timeout'); }) as typeof fetch);
  assert.deepEqual(failed, { amapUrl: 'https://surl.amap.com/test', location: null, price: null, poiId: null });
  let count = 0;
  await resolveAmapUrl('https://surl.amap.com/test', (async () => {
    count++; return new Response(null, { status: 302, headers: { location: '/test' } });
  }) as typeof fetch);
  assert.equal(count, 5);
  await assert.rejects(resolveAmapUrl('https://example.com/test'));
});

test('navigation uses GCJ-02 destination, with saved links and old-place search as fallbacks', () => {
  const place = { name: '火锅 & 茶', lat: 22.54, lng: 113.94, amapUrl: 'https://surl.amap.com/test' };
  assert.ok(mapLinks(place, 'ios').native?.startsWith('iosamap://navi?'));
  assert.ok(mapLinks(place, 'android').native?.startsWith('androidamap://navi?'));
  const web = new URL(mapLinks(place, 'web').web);
  assert.equal(web.pathname, '/navigation');
  assert.equal(web.searchParams.get('to'), '113.94,22.54,火锅 & 茶');
  assert.equal(web.searchParams.get('from'), '');
  assert.equal(mapLinks({ ...place, lat: null }, 'web').web, place.amapUrl);
  const search = new URL(mapLinks({ name: '火锅', city: '深圳', address: '科技路', lat: null, lng: null }, 'web').web);
  assert.equal(search.searchParams.get('keyword'), '深圳 火锅 科技路');
});

test('per-person cost is optional and never inferred from rating or address', async () => {
  assert.equal(parseAmapPrice('人均消费：￥128.5'), 129);
  assert.equal(parseAmapPrice('{&quot;cost&quot;:&quot;88&quot;}'), 88);
  for (const text of ['评分4.8 地址128号', '{"cost":0}', '{"cost":-1}', '人均暂无', '人均99999999']) assert.equal(parseAmapPrice(text), null);
  const failed = (async () => { throw new Error('offline'); }) as typeof fetch;
  const result = await resolveAmapUrl('https://uri.amap.com/marker?position=113,22', failed, '店名 人均 ¥88');
  assert.equal(result.location?.lat, 22);
  assert.equal(result.price, 88);
});

test('mobile browsers select their native app scheme, including places without coordinates', () => {
  assert.equal(phonePlatform('Mozilla Android 15'), 'android');
  assert.equal(phonePlatform('Mozilla iPhone OS 18'), 'ios');
  assert.equal(phonePlatform('Mozilla Windows NT'), 'web');
  const p = { name: '私房菜', city: '深圳', lat: null, lng: null };
  const native = mapLinks(p, 'ios').native;
  assert.ok(native?.startsWith('iosamap://arroundpoi?'));
  assert.equal(new URL(native!).searchParams.get('keywords'), '深圳 私房菜');
});
