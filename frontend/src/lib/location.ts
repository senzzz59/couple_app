import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { canLocateSilently, currentPosition } from './geo';

/**
 * 我的位置（高德坐标系）。像地图 / 外卖 App 一样提前准备好：
 * - 上次的位置存在本地，打开 App 立刻可用（「我附近」排序、路线估算不用等）
 * - 已经允许过定位时，打开 App、切回前台、以及前台每 5 分钟悄悄更新一次；从不主动弹权限框
 * - 需要位置时：3 分钟内的直接用；半小时内的先用着，同时后台刷新；更旧的才现等
 */
type Pos = { lat: number; lng: number; at: number };
const KEY = 'couple.lastPos';
const FRESH = 3 * 60_000;
const USABLE = 30 * 60_000;
const INTERVAL = 5 * 60_000;

let pos: Pos | null = null;
let pending: Promise<Pos> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const loaded = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const saved = raw ? (JSON.parse(raw) as Pos) : null;
    if (saved && typeof saved.lat === 'number' && typeof saved.lng === 'number' && !pos) {
      pos = saved;
      emit();
    }
  })
  .catch(() => {});

function refresh(): Promise<Pos> {
  pending ??= currentPosition(false, 60_000)
    .then((p) => {
      pos = { lat: p.lat, lng: p.lng, at: Date.now() };
      AsyncStorage.setItem(KEY, JSON.stringify(pos)).catch(() => {});
      emit();
      return pos;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export async function locate(force = false): Promise<Pos | null> {
  await loaded;
  const age = pos ? Date.now() - pos.at : Infinity;
  if (!force && pos && age < FRESH) return pos;
  if (!force && pos && age < USABLE) {
    refresh().catch(() => {});
    return pos;
  }
  return refresh();
}

/** 登录后挂一次：已有定位权限就在后台把位置准备好 */
export function startLocationWarmup() {
  let stopped = false;
  const tick = async () => {
    if (stopped || pending) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    await loaded;
    if (pos && Date.now() - pos.at < FRESH) return;
    if (await canLocateSilently().catch(() => false)) refresh().catch(() => {});
  };
  void tick();
  const timer = setInterval(() => void tick(), INTERVAL);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void tick();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearInterval(timer);
    sub.remove();
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

export function useMyLocation() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => pos,
    () => null
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
