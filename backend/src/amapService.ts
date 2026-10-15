import type { AmapPlace, TravelMode, TravelOption } from './amapTypes.ts';

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
function number(v: unknown, max = Infinity) {
  if (!(typeof v === 'string' && v.trim() || typeof v === 'number')) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
function coordinate(v: unknown, max: number) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}
export function normalizeAmapPlace(value: unknown): AmapPlace | null {
  const p = object(value), biz = object(p.biz_ext);
  if (!text(p.id) || !text(p.name)) return null;
  const [lng, lat] = text(p.location).split(',');
  return {
    id: text(p.id, 40), name: text(p.name, 80), address: text(p.address), city: text(p.cityname, 40), cityCode: text(p.citycode, 12),
    lat: coordinate(lat, 90), lng: coordinate(lng, 180), category: text(p.type).split(';')[1] ?? '',
    rating: number(biz.rating, 5) || null, price: number(biz.cost, 100000) ? Math.round(Number(biz.cost)) : null,
    hours: text(biz.opentime || p.opentime || p.opentime2), phone: text(p.tel, 100),
    photos: list(p.photos).slice(0, 12).flatMap((photo) => {
      const item = object(photo);
      try {
        const u = new URL(text(item.url, 2000));
        if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return [];
        u.protocol = 'https:';
        return [{ url: u.href, title: text(item.title || item.titile, 80) }];
      } catch { return []; }
    }),
  };
}

export class AmapServiceError extends Error {}
/** All URLs are fixed AMap endpoints. Never forward a user-supplied URL or raw upstream errors/keys. */
export function amapService(key: string, fetcher: typeof fetch = fetch) {
  async function request(path: string, params: Record<string, string>) {
    if (!key) throw new AmapServiceError('店铺实时信息暂未开启，仍可手动收藏或前往高德查看');
    try {
      const url = new URL(`https://restapi.amap.com/${path}`);
      url.search = new URLSearchParams({ key, output: 'JSON', ...params }).toString();
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) throw new Error('upstream');
      const data = object(await response.json());
      if (!(data.status === '1' || data.status === 1 || data.errcode === 0)) throw new Error('upstream');
      return data;
    } catch (error) {
      if (error instanceof AmapServiceError) throw error;
      throw new AmapServiceError('高德暂未返回数据，请稍后刷新或前往高德查看');
    }
  }
  return {
    async search(query: string, city: string) {
      const data = await request('v3/place/text', { keywords: query, city, types: '050000', offset: '8', extensions: 'all' });
      return list(data.pois).map(normalizeAmapPlace).filter((p): p is AmapPlace => !!p);
    },
    async detail(id: string) {
      const data = await request('v3/place/detail', { id, extensions: 'all' });
      return normalizeAmapPlace(list(data.pois)[0]);
    },
    async journey(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, city = '', destinationCity = '') {
      const params = { origin: `${origin.lng.toFixed(6)},${origin.lat.toFixed(6)}`, destination: `${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}` };
      const modes: TravelMode[] = ['walking', 'cycling', 'driving', 'transit'];
      return Promise.all(modes.map(async (mode): Promise<TravelOption> => {
        if (mode === 'transit' && !city) return { mode, seconds: null, meters: null, message: '未能确定出发城市' };
        const path = { walking: 'v3/direction/walking', cycling: 'v4/direction/bicycling', driving: 'v3/direction/driving', transit: 'v3/direction/transit/integrated' }[mode];
        try {
          const data = await request(path, { ...params, ...(mode === 'driving' ? { strategy: '0' } : {}), ...(mode === 'transit' ? { city, cityd: destinationCity || city, strategy: '0' } : {}) });
          const route = object(mode === 'cycling' ? data.data : data.route);
          const paths = list(mode === 'transit' ? route.transits : route.paths);
          const valid = paths.map(object).filter((p) => number(p.duration) != null).sort((a, b) => Number(a.duration) - Number(b.duration));
          const best = valid[0];
          return { mode, seconds: best ? number(best.duration) : null, meters: best ? number(best.distance) : null, ...(!best ? { message: '暂无可用路线' } : {}) };
        } catch (error) {
          return { mode, seconds: null, meters: null, message: (error as Error).message };
        }
      }));
    },
    async cityAt(position: { lat: number; lng: number }) {
      const data = await request('v3/geocode/regeo', { location: `${position.lng.toFixed(6)},${position.lat.toFixed(6)}`, extensions: 'base' });
      const c = object(object(data.regeocode).addressComponent);
      return text(c.citycode, 12) || text(c.city, 40) || text(c.province, 40);
    },
  };
}
