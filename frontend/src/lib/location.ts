import { useState, useSyncExternalStore } from 'react';

import { currentPosition } from './geo';

/** 我的位置（高德坐标系）：问一次权限，之后这次打开 App 都复用，10 分钟内不重复定位 */
type Pos = { lat: number; lng: number; at: number };
let pos: Pos | null = null;
let pending: Promise<Pos | null> | null = null;
const listeners = new Set<() => void>();

export async function locate(force = false): Promise<Pos | null> {
  if (!force && pos && Date.now() - pos.at < 10 * 60_000) return pos;
  pending ??= currentPosition(false)
    .then((p) => {
      pos = { lat: p.lat, lng: p.lng, at: Date.now() };
      listeners.forEach((l) => l());
      return pos;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useMyLocation() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => pos
  );
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = async () => {
    setLocating(true);
    setError(null);
    try {
      return await locate();
    } catch (e) {
      setError((e as Error).message || '没拿到位置');
      return null;
    } finally {
      setLocating(false);
    }
  };
  return { pos: current, locating, error, request };
}

/** 两点距离（公里） */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number | null; lng: number | null }) {
  if (b.lat == null || b.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtKm(km: number | null) {
  if (km == null) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)}m`;
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}
