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
  const payload = p.get('p')?.split(',');
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

/** Follow only approved AMap hosts, with a shared deadline and bounded redirects. */
export async function resolveAmapUrl(value: string, fetcher: typeof fetch = fetch) {
  if (!validAmapUrl(value)) throw new Error('请粘贴高德地图的地点分享链接');
  let current = new URL(value);
  current.protocol = 'https:';
  const amapUrl = current.href;
  const fallback = { amapUrl, location: null };
  const signal = AbortSignal.timeout(6000);
  try {
    for (let i = 0; i < 5; i++) {
      const location = parseAmapLocation(current.href);
      if (location) return { amapUrl, location };
      // Full links without coordinates still remain usable as saved destinations.
      if (!['surl.amap.com', 'url.amap.com'].includes(current.hostname)) return fallback;
      const res = await fetcher(current.href, { redirect: 'manual', signal });
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (res.status < 300 || res.status >= 400 || !next) return fallback;
      const target = new URL(next, current);
      if (!validAmapUrl(target.href)) return fallback;
      target.protocol = 'https:';
      current = target;
    }
  } catch {}
  return fallback;
}
