import { useSyncExternalStore } from 'react';
import { createUpdateController } from './updateController';

import type { ReleaseNote } from './updates';

type WebBuild = { id: string; version: string; commit?: string | null; builtAt?: string; assets: string[]; releases?: Record<string, string>; notes?: ReleaseNote[] };
const current = typeof window === 'undefined' ? null : (window as unknown as { __US_BUILD__?: WebBuild }).__US_BUILD__ ?? null;
let candidate: WebBuild | null = null;
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

async function fetchTimed(url: string, timeout: number, cache: RequestCache) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { cache, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export function registerWebsite() {
  if (!registration) {
    registration = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext
      ? navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => null)
      : Promise.resolve(null);
  }
  return registration;
}

export const updatesEnabled = () => !!current;
export const appUpdates = createUpdateController({
  enabled: updatesEnabled,
  check: async () => {
    const response = await fetchTimed('/version.json', 12_000, 'no-store');
    if (!response.ok) throw new Error('版本检查失败');
    const data = await response.json() as WebBuild;
    if (!/^[a-f0-9]{16}$/.test(data.id) || typeof data.version !== 'string' || !Array.isArray(data.assets) || !data.assets.every((asset) => typeof asset === 'string' && asset.startsWith('/_expo/static/js/web/') && !asset.includes('..'))) throw new Error('版本信息无效');
    candidate = data;
    return { isAvailable: data.id !== current?.id };
  },
  fetch: async () => {
    if (!candidate) return { isNew: false };
    const worker = await registerWebsite();
    if (worker) await worker.update();
    // Fetch the new bundle before offering a refresh, including browsers without workers.
    for (const asset of candidate.assets) {
      const response = await fetchTimed(asset, 30_000, 'reload');
      if (!response.ok) throw new Error('新版下载失败');
      await response.arrayBuffer();
    }
    return { isNew: candidate.id !== current?.id };
  },
  reload: async () => {
    const worker = await registerWebsite();
    worker?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    // 收起键盘、回到页面顶端再刷新：iOS 会记住刷新前的滚动位置，导致刷新后整页错位、底部标签栏被挤出屏幕
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.scrollTo(0, 0);
    window.location.reload();
  },
});

export const useAppUpdates = () => useSyncExternalStore(appUpdates.subscribe, appUpdates.getState, appUpdates.getState);
export const appVersion = current?.version ?? '开发版';
/** 这次构建的提交和时间（设置 · 关于里显示） */
export const buildInfo = { commit: current?.commit ?? null, builtAt: current?.builtAt ?? null };
/** 更新记录每一条的版本号（构建时从 git 历史算出来） */
export const releaseVersions: Record<string, string> = current?.releases ?? {};
export const updateVersion = current?.id.slice(0, 8);

const validNote = (n: unknown): n is ReleaseNote => {
  const r = n as ReleaseNote;
  return !!r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.date === 'string' && Array.isArray(r.changes) && r.changes.every((c) => c && typeof c.text === 'string');
};
/** 检查到的新版本：版本号和它的更新内容（「发现新版本」弹窗用） */
export function updateCandidate() {
  if (!candidate || candidate.id === current?.id) return null;
  return { version: candidate.version, notes: (Array.isArray(candidate.notes) ? candidate.notes : []).filter(validNote) };
}
