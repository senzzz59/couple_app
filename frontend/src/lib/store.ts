import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { api } from './api';

/**
 * 极简数据缓存：key 就是 API 路径。任意地方 invalidate('places') 都会让
 * 所有以 /api/places 开头、正在显示的列表重新拉取。实时通道收到变化也调用它。
 */
type Entry = { data: unknown; error: string | null; loading: boolean; fetchedAt: number; promise?: Promise<void> };

const cache = new Map<string, Entry>();
const pendingInvalidations = new Set<string>();
let generation = 0;
const listeners = new Map<string, Set<() => void>>();
const EMPTY: Entry = { data: undefined, error: null, loading: true, fetchedAt: 0 };

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function fetchKey(key: string): Promise<void> {
  const prev = cache.get(key) ?? EMPTY;
  if (prev.promise) return prev.promise;
  const startedGeneration = generation;
  const promise = api
    .get(key)
    .then((data) => {
      if (startedGeneration === generation) cache.set(key, { data, error: null, loading: false, fetchedAt: Date.now() });
    })
    .catch((e: Error) => {
      if (startedGeneration === generation) cache.set(key, { ...prev, error: e.message, loading: false, promise: undefined });
    })
    .then(() => {
      if (startedGeneration !== generation) return;
      emit(key);
      if (pendingInvalidations.delete(key)) {
        if (listeners.get(key)?.size) return fetchKey(key);
        const entry = cache.get(key)!;
        cache.set(key, { ...entry, fetchedAt: 0 });
      }
    });
  cache.set(key, { ...prev, loading: prev.data === undefined, promise });
  return promise;
}

export function useQuery<T>(key: string | null) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(cb);
      return () => listeners.get(key)?.delete(cb);
    },
    [key]
  );
  const entry = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) ?? EMPTY) : EMPTY));

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key);
    // 30 秒内的缓存直接用，否则后台刷新
    if (!e || Date.now() - e.fetchedAt > 30_000) fetchKey(key);
  }, [key]);

  const refresh = useCallback(() => (key ? fetchKey(key) : Promise.resolve()), [key]);
  return { data: entry.data as T | undefined, error: entry.error, loading: entry.loading, refresh };
}

/** 让某个集合相关的所有缓存失效：正在显示的立刻刷新，其它的下次进入再拉 */
export function invalidate(collection: string): Promise<void> {
  const prefix = `/api/${collection}`;
  const running: Promise<void>[] = [];
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(prefix + '?') || key.startsWith(prefix + '/')) {
      const e = cache.get(key)!;
      cache.set(key, { ...e, fetchedAt: 0 });
      if (e.promise) pendingInvalidations.add(key);
      if (listeners.get(key)?.size) running.push(fetchKey(key));
    }
  }
  // 返回正在显示的数据重新拉取完成的时机，下拉刷新可以等它
  return Promise.all(running).then(() => {});
}

/** 乐观更新：先改本地缓存，让动画立刻生效 */
export function setQueryData<T>(key: string, updater: (prev: T | undefined) => T) {
  const e = cache.get(key) ?? { ...EMPTY, loading: false };
  cache.set(key, { ...e, data: updater(e.data as T | undefined) });
  emit(key);
}

/** 读缓存里第一个匹配的数据（不触发请求） */
export function peekQuery<T>(match: (key: string) => boolean): T | undefined {
  for (const [key, e] of cache) if (match(key) && e.data !== undefined) return e.data as T;
  return undefined;
}

export function clearCache() {
  generation++;
  cache.clear();
  pendingInvalidations.clear();
  for (const key of listeners.keys()) emit(key);
}
