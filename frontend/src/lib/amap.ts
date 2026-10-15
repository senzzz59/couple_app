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

export function mapLinks(p: MapDestination, platform: string) {
  const hasCoordinates = p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  if (hasCoordinates) {
    const name = encodeURIComponent(p.name);
    return {
      native: `${platform === 'ios' ? 'iosamap' : 'androidamap'}://navi?sourceApplication=uscouple&poiname=${name}&lat=${p.lat}&lon=${p.lng}&dev=0&style=0`,
      web: `https://uri.amap.com/navigation?from=&to=${p.lng},${p.lat},${name}&mode=car&src=uscouple&callnative=1`,
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
