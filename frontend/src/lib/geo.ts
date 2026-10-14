import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { mapLinks, type MapDestination } from './amap';

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

export async function currentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('需要定位权限才能获取当前位置');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [lng, lat] = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
  let address = '';
  let city = '';
  try {
    const [g] = await Location.reverseGeocodeAsync(pos.coords);
    if (g) {
      address = [g.district, g.street, g.streetNumber, g.name].filter((x, i, arr) => x && arr.indexOf(x) === i).join('');
      city = g.city ?? g.region ?? '';
    }
  } catch {}
  return { lat, lng, address, city };
}

export interface Poi {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  category: string;
}

/** 高德 POI 搜索（需要在 .env 里配置 EXPO_PUBLIC_AMAP_KEY，Web 服务类型的 key） */
export const AMAP_KEY = process.env.EXPO_PUBLIC_AMAP_KEY;
export async function searchPoi(keywords: string, city = ''): Promise<Poi[]> {
  if (!AMAP_KEY || !keywords.trim()) return [];
  const url = `https://restapi.amap.com/v3/place/text?key=${AMAP_KEY}&keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(city)}&types=050000&offset=15&extensions=base`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.pois ?? []).map((p: Record<string, string>) => {
    const [lng, lat] = String(p.location).split(',').map(Number);
    return {
      name: p.name,
      address: typeof p.address === 'string' ? p.address : '',
      city: typeof p.cityname === 'string' ? p.cityname : '',
      lat,
      lng,
      category: String(p.type ?? '').split(';')[1] ?? '',
    };
  });
}

/** 高德 JS API（足迹地图用）：控制台创建「Web端(JS API)」类型的 Key，会同时给一个安全密钥 */
export const AMAP_JS_KEY = process.env.EXPO_PUBLIC_AMAP_JS_KEY;
export const AMAP_JS_CODE = process.env.EXPO_PUBLIC_AMAP_JS_CODE ?? '';

/** 打开导航：优先高德 App，没有就打开高德网页版（网页版也会尝试唤起 App） */
export async function openInMaps(p: MapDestination) {
  const { native, web } = mapLinks(p, Platform.OS);
  if (Platform.OS !== 'web' && native) {
    try {
      await Linking.openURL(native);
      return;
    } catch {}
  }
  return Linking.openURL(web);
}

/** 从小红书分享文案里提取链接和标题 */
export function parseXhsShare(text: string) {
  const url = text.match(/https?:\/\/[^\s，。！!（）()【】]+/)?.[0] ?? null;
  const title = text.match(/【([^】]+)】/)?.[1]?.split(/\s+-\s+/)[0]?.trim() ?? null;
  return { url, title };
}
