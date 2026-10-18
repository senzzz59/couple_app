import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { mapLinks, phonePlatform, type MapDestination, type NavMode } from './amap';

/**
 * 国内地图用 GCJ-02 坐标（高德 / Apple 地图中国区）。手机定位拿到的是 WGS-84，需要转换。
 * 数据库里统一存 GCJ-02。
 */
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function tLat(x: number, y: number) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
}
function tLng(x: number, y: number) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
}
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}

type Coords = { latitude: number; longitude: number };

function browserPosition(highAccuracy: boolean, maxAge: number, timeout: number) {
  return new Promise<Coords>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('这个浏览器不支持定位'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => {
        const error = new Error(e.code === 1 ? '需要定位权限：在系统设置里允许浏览器使用位置' : e.code === 3 ? '定位超时，换个信号好点的地方再试' : '暂时拿不到位置，稍后再试') as Error & { code?: number };
        error.code = e.code;
        reject(error);
      },
      { enableHighAccuracy: highAccuracy, maximumAge: maxAge, timeout }
    );
  });
}

/**
 * 拿手机的位置（WGS-84）。maxAge 内系统缓存的位置直接用，不重新定位，几乎是瞬间返回。
 * 网页版直接调用浏览器定位：只定位一次，带超时；先用省电的网络定位，拿不到再用 GPS。
 */
async function devicePosition(maxAge: number): Promise<Coords> {
  if (Platform.OS === 'web') {
    try {
      return await browserPosition(false, maxAge, 8000);
    } catch (e) {
      if ((e as { code?: number }).code === 1) throw e;
      return browserPosition(true, maxAge, 20000);
    }
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('需要定位权限才能获取当前位置');
  if (maxAge > 0) {
    const last = await Location.getLastKnownPositionAsync({ maxAge });
    if (last) return last.coords;
  }
  return (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
}

/** 不弹权限框的前提下，现在能不能直接定位（已经允许过） */
export async function canLocateSilently() {
  if (Platform.OS !== 'web') return (await Location.getForegroundPermissionsAsync()).granted;
  try {
    const state = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return state?.state === 'granted';
  } catch {
    return false;
  }
}

export async function currentPosition(includeAddress = true, maxAge = 0) {
  const coords = await devicePosition(maxAge);
  const [lng, lat] = wgs84ToGcj02(coords.longitude, coords.latitude);
  let address = '';
  let city = '';
  try {
    if (!includeAddress || Platform.OS === 'web') return { lat, lng, address, city };
    const [g] = await Location.reverseGeocodeAsync(coords);
    if (g) {
      address = [g.district, g.street, g.streetNumber, g.name].filter((x, i, arr) => x && arr.indexOf(x) === i).join('');
      city = g.city ?? g.region ?? '';
    }
  } catch {}
  return { lat, lng, address, city };
}

/** Compatibility with an already-configured public Web-service key; live calls use the backend. */
export const AMAP_KEY = process.env.EXPO_PUBLIC_AMAP_KEY;

/** 高德 JS API（足迹地图用）：控制台创建「Web端(JS API)」类型的 Key，会同时给一个安全密钥 */
export const AMAP_JS_KEY = process.env.EXPO_PUBLIC_AMAP_JS_KEY;
export const AMAP_JS_CODE = process.env.EXPO_PUBLIC_AMAP_JS_CODE ?? '';

/** 打开导航：优先高德 App，没有就打开高德网页版（网页版也会尝试唤起 App）；mode 是怎么去 */
export async function openInMaps(p: MapDestination, mode: NavMode = 'driving') {
  const platform = Platform.OS === 'web' && typeof navigator !== 'undefined' ? phonePlatform(navigator.userAgent) : Platform.OS;
  const { native, web } = mapLinks(p, platform, mode);
  if (Platform.OS === 'web' && platform !== 'web' && native) {
    return launchAmapWeb(native, web);
  }
  if (Platform.OS !== 'web' && native) {
    try {
      await Linking.openURL(native);
      return;
    } catch {}
  }
  return Linking.openURL(web);
}

function launchAmapWeb(native: string, web: string) {
  const fallback = window.setTimeout(() => { cleanup(); window.location.assign(web); }, 1800);
  const cleanup = () => {
    window.clearTimeout(fallback);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', cleanup);
  };
  const onHide = () => { if (document.hidden) cleanup(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', cleanup, { once: true });
  window.location.assign(native);
}

/** Open the exact POI detail page for reviews, separately from navigation. */
export async function openAmapPlace(p: MapDestination) {
  const url = p.amapUrl;
  if (!url) return openInMaps(p);
  const platform = Platform.OS === 'web' && typeof navigator !== 'undefined' ? phonePlatform(navigator.userAgent) : Platform.OS;
  const params = new URL(url).searchParams;
  const id = params.get('poiid') ?? (params.get('__p') ?? params.get('p'))?.split(',')[0];
  if (id && p.lat != null && p.lng != null && platform === 'android') {
    const native = `amapuri://poi/detail?sourceApplication=uscouple&poiname=${encodeURIComponent(p.name)}&lat=${p.lat}&lon=${p.lng}&poiid=${encodeURIComponent(id)}`;
    if (Platform.OS === 'web') return launchAmapWeb(native, url);
    try { await Linking.openURL(native); return; } catch {}
  }
  return Linking.openURL(url);
}

/** 从小红书分享文案里提取链接和标题 */
export function parseXhsShare(text: string) {
  const url = text.match(/https?:\/\/[^\s，。！!（）()【】]+/)?.[0] ?? null;
  const title = text.match(/【([^】]+)】/)?.[1]?.split(/\s+-\s+/)[0]?.trim() ?? null;
  return { url, title };
}
