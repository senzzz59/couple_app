import { File, Paths, type DownloadTask } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { getBaseUrl } from './api';
import type { ReleaseNote } from './updates';

/**
 * 安卓新安装包（原生部分变了，热更新装不上）：
 * - 问服务器最新安装包的 runtime（原生指纹），和自己的不一样就是有新安装包
 * - 在 App 里下载（显示进度），下载好后打开系统安装界面，覆盖安装
 * 弹窗在 components/ApkUpdate.tsx。
 */
export type ApkInfo = { version: string; build: string; runtime: string; size: number; url: string; notes: ReleaseNote[] };
export type ApkPhase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
export type ApkState = { phase: ApkPhase; info: ApkInfo | null; received: number; total: number; speed: number; open: boolean; error: string | null };

let state: ApkState = { phase: 'idle', info: null, received: 0, total: 0, speed: 0, open: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<ApkState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useApkUpdate = () => useSyncExternalStore(subscribe, () => state, () => state);

export const apkUpdateSupported = () => Platform.OS === 'android' && !__DEV__ && !!Updates.runtimeVersion;

/** 这次打开 App 点过「稍后」：不再自动弹出，「检查更新」时还会弹 */
let snoozed = false;
let task: DownloadTask | null = null;
let checking: Promise<boolean> | null = null;

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${getBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`);
const fileOf = (info: ApkInfo) => new File(Paths.cache, `us-${info.build.replace(/[^\w-]/g, '').slice(0, 36)}.apk`);

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return res.ok ? await res.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

function removeOldApks(keep?: File) {
  try {
    for (const f of Paths.cache.list()) {
      if (f instanceof File && /^us-.*\.apk$/.test(f.name) && f.uri !== keep?.uri) f.delete();
    }
  } catch {}
}

/** 有没有新安装包；manual：用户点了「检查更新」，点过「稍后」也照样弹出 */
export function checkApkUpdate(manual = false): Promise<boolean> {
  if (!apkUpdateSupported()) return Promise.resolve(false);
  if (state.phase === 'downloading' || state.phase === 'downloaded') {
    if (manual) set({ open: true });
    return Promise.resolve(true);
  }
  if (checking) return checking;
  checking = (async () => {
    const raw = await fetchJson(`${getBaseUrl()}/api/app/android`).catch(() => null);
    if (!raw || typeof raw.runtime !== 'string' || !raw.runtime || typeof raw.url !== 'string') return false;
    if (raw.runtime === Updates.runtimeVersion) {
      // 已经是最新的安装包：删掉以前下载过的安装包
      removeOldApks();
      return false;
    }
    // 这个安装包带来的更新内容：网页版的更新记录里，这个 App 还没有的那些
    const site = await fetchJson(`${getBaseUrl()}/version.json`).catch(() => null);
    const notes: ReleaseNote[] = Array.isArray(site?.notes) ? site.notes : [];
    const info: ApkInfo = { version: String(raw.version ?? ''), build: String(raw.build ?? raw.runtime), runtime: raw.runtime, size: Number(raw.size) || 0, url: absolute(raw.url), notes };
    const file = fileOf(info);
    const ready = file.exists && info.size > 0 && file.size === info.size;
    set({ info, phase: ready ? 'downloaded' : 'available', received: ready ? info.size : 0, total: info.size, error: null, open: manual || !snoozed || state.open });
    return true;
  })().finally(() => (checking = null));
  return checking;
}

export function closeApkUpdate() {
  snoozed = true;
  set({ open: false });
}

export async function downloadApk() {
  const info = state.info;
  if (!info || state.phase === 'downloading') return;
  const file = fileOf(info);
  removeOldApks();
  set({ phase: 'downloading', received: 0, total: info.size, speed: 0, error: null });
  // 速度按最近两秒算，数字不会乱跳
  const samples: { t: number; b: number }[] = [];
  task = File.createDownloadTask(info.url, file, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const now = Date.now();
      samples.push({ t: now, b: bytesWritten });
      while (samples.length > 2 && now - samples[0].t > 2000) samples.shift();
      const span = (now - samples[0].t) / 1000;
      set({ received: bytesWritten, total: totalBytes > 0 ? totalBytes : info.size, speed: span > 0.3 ? (bytesWritten - samples[0].b) / span : state.speed });
    },
  });
  try {
    const done = await task.downloadAsync();
    // 被取消了
    if (!done) return;
    if (info.size > 0 && done.size !== info.size) throw new Error('size');
    set({ phase: 'downloaded', received: info.size, open: true });
    void installApk();
  } catch {
    if ((state.phase as ApkPhase) === 'downloading') set({ phase: 'error', error: '下载中断了，检查网络后重试' });
  } finally {
    task = null;
  }
}

export function cancelApkDownload() {
  task?.cancel();
  task = null;
  set({ phase: 'available', received: 0, speed: 0 });
}

/** 打开系统安装界面（第一次会让在设置里允许「安装未知应用」） */
export async function installApk() {
  const info = state.info;
  if (!info) return false;
  const file = fileOf(info);
  if (!file.exists) {
    set({ phase: 'available', received: 0 });
    return false;
  }
  try {
    const data = await getContentUriAsync(file.uri);
    // FLAG_GRANT_READ_URI_PERMISSION：让安装器读得到这个文件
    void startActivityAsync('android.intent.action.VIEW', { data, flags: 1, type: 'application/vnd.android.package-archive' }).catch(() => {});
    return true;
  } catch {
    set({ error: '打不开安装界面，可以到网页版「设置 → 下载 App 版」下载' });
    return false;
  }
}
