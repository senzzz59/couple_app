const hosts = new Set(['amap.com', 'www.amap.com', 'm.amap.com', 'wb.amap.com', 'uri.amap.com', 'surl.amap.com', 'url.amap.com', 'ditu.amap.com']);

/** Accept a copied AMap URL or the full share message, never an arbitrary link. */
export function amapShareUrl(text: string): string | null {
  const links = text.match(/https?:\/\/[^\s<>"，。！!（）()【】]+/gi) ?? [];
  for (const link of links) {
    try {
      const u = new URL(link);
      if (!hosts.has(u.hostname) || u.username || u.password || u.port) continue;
      u.protocol = 'https:';
      if (u.href.length <= 2000) return u.href;
    } catch {}
  }
  return null;
}

export interface MapDestination {
  name: string;
  lat: number | null;
  lng: number | null;
  address?: string | null;
  city?: string | null;
  amapUrl?: string | null;
}

/** 怎么去：步行 / 骑行 / 公交地铁 / 开车 */
export type NavMode = 'walking' | 'cycling' | 'transit' | 'driving';
export const NAV_MODES: NavMode[] = ['walking', 'cycling', 'transit', 'driving'];

/** 高德路线规划的出行方式：t（App）和 mode（网页版） */
const AMAP_ROUTE: Record<Exclude<NavMode, 'driving'>, { t: number; web: string }> = {
  transit: { t: 1, web: 'bus' },
  walking: { t: 2, web: 'walk' },
  cycling: { t: 3, web: 'ride' },
};

export function hasCoordinates(p: MapDestination) {
  return p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/**
 * 打开高德的链接。开车直接进导航；步行、骑行、公交地铁打开对应方式的路线规划（从当前位置出发）。
 * 没有坐标的老店铺只能搜索，没法选出行方式。
 */
export function mapLinks(p: MapDestination, platform: string, mode: NavMode = 'driving') {
  if (hasCoordinates(p)) {
    const name = encodeURIComponent(p.name);
    if (mode === 'driving') {
      return {
        native: `${platform === 'ios' ? 'iosamap' : 'androidamap'}://navi?sourceApplication=uscouple&poiname=${name}&lat=${p.lat}&lon=${p.lng}&dev=0&style=0`,
        web: `https://uri.amap.com/navigation?from=&to=${p.lng},${p.lat},${name}&mode=car&src=uscouple&callnative=1`,
      };
    }
    const route = AMAP_ROUTE[mode];
    const query = `sourceApplication=uscouple&dlat=${p.lat}&dlon=${p.lng}&dname=${name}&dev=0&t=${route.t}`;
    return {
      native: platform === 'ios' ? `iosamap://path?${query}` : `amapuri://route/plan/?${query}`,
      web: `https://uri.amap.com/navigation?from=&to=${p.lng},${p.lat},${name}&mode=${route.web}&src=uscouple&callnative=1`,
    };
  }
  return {
    native: `${platform === 'ios' ? 'iosamap' : 'androidamap'}://arroundpoi?sourceApplication=uscouple&keywords=${encodeURIComponent([p.city, p.name, p.address].filter(Boolean).join(' '))}&dev=0`,
    web: (p.amapUrl && amapShareUrl(p.amapUrl)) || `https://uri.amap.com/search?keyword=${encodeURIComponent([p.city, p.name, p.address].filter(Boolean).join(' '))}&callnative=1`,
  };
}

/** Browsers cannot reliably query installed apps. Detect only the phone OS. */
export function phonePlatform(userAgent: string) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
}
