import type { AmapPlace } from '../../../backend/src/amapTypes';
export type { AmapPlace, AmapDetails, AmapJourney, TravelMode, TravelOption } from '../../../backend/src/amapTypes';

export function poiUrl(place: AmapPlace) {
  const url = new URL('https://m.amap.com/poi/detail');
  url.searchParams.set('poiid', place.id);
  if (place.lat != null && place.lng != null) url.searchParams.set('__p', `${place.id},${place.lat},${place.lng},${place.name}`);
  return url.href;
}
export function travelTime(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '暂无';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
}
export function travelDistance(meters: number | null) {
  if (meters == null || !Number.isFinite(meters)) return '';
  return meters < 1000 ? `${Math.round(meters)}米` : `${(meters / 1000).toFixed(1)}公里`;
}
