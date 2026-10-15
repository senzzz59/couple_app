const hosts = new Set(['amap.com', 'www.amap.com', 'm.amap.com', 'wb.amap.com', 'uri.amap.com', 'surl.amap.com', 'url.amap.com', 'ditu.amap.com']);

export function validAmapUrl(value: string) {
  try {
    const u = new URL(value);
    return value.length <= 2000 && ['http:', 'https:'].includes(u.protocol) && hosts.has(u.hostname) && !u.username && !u.password && !u.port;
  } catch { return false; }
}

export function parseAmapLocation(value: string) {
  const u = new URL(value);
  const p = u.searchParams;
  // AMap's share payload p/q uses latitude first; URI position/to uses longitude first.
  const payload = (p.get('p') ?? p.get('__p'))?.split(',');
  const q = p.get('q')?.split(',');
  const position = (p.get('position') ?? p.get('to'))?.split(',');
  const latText = payload?.[1] ?? q?.[0] ?? position?.[1] ?? p.get('lat');
  const lngText = payload?.[2] ?? q?.[1] ?? position?.[0] ?? p.get('lon') ?? p.get('lng');
  const lat = latText?.trim() ? Number(latText) : NaN;
  const lng = lngText?.trim() ? Number(lngText) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // URI URLs explicitly marked GPS must be converted rather than treated as GCJ-02.
  if (p.get('coordinate') === 'gps' || p.get('dev') === '1') return null;
  return {
    lat, lng,
    name: (payload?.[3] ?? q?.[2] ?? position?.[2] ?? p.get('name') ?? p.get('poiname') ?? '').slice(0, 80),
    address: (payload?.[4] ?? q?.[3] ?? '').slice(0, 200),
  };
}

export function parseAmapPoiId(value: string): string | null {
  try {
    const p = new URL(value).searchParams;
    const id = p.get('poiid') ?? p.get('id') ?? (p.get('p') ?? p.get('__p'))?.split(',')[0];
    return id && /^[a-zA-Z0-9]{6,40}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Only explicit per-person cost fields; ratings, totals and arbitrary numbers are ignored. */
export function parseAmapPrice(text: string): number | null {
  const decoded = text.replace(/&quot;|&#34;/g, '"').replace(/&#165;|&yen;/g, '¥');
  const raw = decoded.match(/(?:人均(?:消费|价格)?\s*[:：]?\s*[¥￥]?\s*)(\d+(?:\.\d+)?)/)?.[1]
    ?? decoded.match(/"(?:cost|avg_price|avgPrice|price_per_person)"\s*:\s*"?(\d+(?:\.\d+)?)/)?.[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 100000 ? Math.round(value) : null;
}

async function boundedText(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512000) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel(); }
  return text;
}

/** Follow only approved AMap hosts, with a shared deadline and bounded redirects. */
export async function resolveAmapUrl(value: string, fetcher: typeof fetch = fetch, shareText = '') {
  if (!validAmapUrl(value)) throw new Error('请粘贴高德地图的地点分享链接');
  let current = new URL(value);
  current.protocol = 'https:';
  const amapUrl = current.href;
  const fallback = { amapUrl, location: null, price: parseAmapPrice(shareText) };
  const signal = AbortSignal.timeout(6000);
  let poiId: string | null = null;
  let location = null;
  let price = fallback.price;
  try {
    for (let i = 0; i < 5; i++) {
      poiId = parseAmapPoiId(current.href) ?? poiId;
      location = parseAmapLocation(current.href) ?? location;
      price = price ?? parseAmapPrice(current.search);
      const res = await fetcher(current.href, { redirect: 'manual', signal });
      const next = res.headers.get('location');
      if (res.status >= 200 && res.status < 300) {
        price = price ?? parseAmapPrice(await boundedText(res));
        return { amapUrl, location, price, poiId };
      }
      await res.body?.cancel();
      if (res.status < 300 || res.status >= 400 || !next) break;
      const target = new URL(next, current);
      if (!validAmapUrl(target.href)) break;
      target.protocol = 'https:';
      current = target;
    }
  } catch {}
  return { amapUrl, location, price, poiId };
}
