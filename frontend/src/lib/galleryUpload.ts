import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { toast } from '@/components/motion';

import { api, ApiError } from './api';
import { haptic } from './haptics';
import { pickMedia, releaseLocal, uploadMedia, type LocalMedia } from './media';
import { invalidate } from './store';
import { isCancelled } from './upload';
import { deleteUpload, loadUploads, saveUpload } from './uploadStore';

/**
 * 相册上传队列：
 * - 每一项单独记录状态和进度，点开上传条能看到排队 / 上传中 / 处理中 / 快速上传 / 失败
 * - 同时传三项；网络断了、服务器临时出错自动等一会儿重试，回到 App、网络恢复时马上接着传
 * - 网页版把队列连同文件存在浏览器里：切到别的应用、页面被关掉，下次打开接着传
 * - 同一个文件以前传过就「快速上传」：服务器直接复制一份，不用再传
 * 每传完一项就登记到相册，中途失败已经传好的不会丢。
 */
/** 日期以什么为准：照片的拍摄时间（默认） / 上传的时间 */
export type DateMode = 'taken' | 'upload';

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'instant' | 'failed';
export type UploadItem = {
  id: string;
  media: LocalMedia;
  albumId?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  attempts: number;
  /** 网络出错后，等到这个时间再重试 */
  retryAt?: number;
  addedAt: number;
  dateMode?: DateMode;
};
export type UploadJob = { total: number; done: number; instant: number; failed: number; active: number; progress: number; status: 'uploading' | 'done' };

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 6;
const ACTIVE: UploadStatus[] = ['queued', 'uploading', 'processing'];

let items: UploadItem[] = [];
let job: UploadJob | null = null;
const listeners = new Set<() => void>();

function summarize(): UploadJob | null {
  if (!items.length) return null;
  const count = (s: UploadStatus) => items.filter((i) => i.status === s).length;
  const active = items.filter((i) => ACTIVE.includes(i.status)).length;
  const weight = (i: UploadItem) => i.media.size ?? 1;
  const total = items.reduce((n, i) => n + weight(i), 0) || 1;
  const sent = items.reduce((n, i) => n + weight(i) * (ACTIVE.includes(i.status) ? i.progress : 1), 0);
  return { total: items.length, done: items.length - active, instant: count('instant'), failed: count('failed'), active, progress: sent / total, status: active ? 'uploading' : 'done' };
}
function emit() {
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = null;
  job = summarize();
  listeners.forEach((l) => l());
}
/** 进度一秒能来几十次：合并成最多 10 次刷新，几百项一起传时页面也不卡 */
let emitTimer: ReturnType<typeof setTimeout> | null = null;
function emitSoon() {
  emitTimer ??= setTimeout(emit, 100);
}
function update(id: string, patch: Partial<UploadItem>) {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  // 只有进度变了就晚一点再刷新；状态变化马上显示
  if (Object.keys(patch).length === 1 && 'progress' in patch) emitSoon();
  else emit();
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** 上传进度汇总（上传条用） */
export function useUploadJob() {
  return useSyncExternalStore(subscribe, () => job);
}
/** 每一项的状态（上传详情用） */
export function useUploadItems() {
  return useSyncExternalStore(subscribe, () => items);
}

// ---------------- 调度
let running = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function pump() {
  const now = Date.now();
  while (running < CONCURRENCY) {
    const next = items.find((i) => i.status === 'queued' && (i.retryAt ?? 0) <= now);
    if (!next) break;
    running++;
    void work(next).finally(() => {
      running--;
      pump();
      if (!running && !items.some((i) => ACTIVE.includes(i.status))) finished();
    });
  }
  // 有在等重试的：到点再叫醒
  const waits = items.filter((i) => i.status === 'queued' && (i.retryAt ?? 0) > now).map((i) => i.retryAt!);
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = waits.length ? setTimeout(pump, Math.max(500, Math.min(...waits) - now)) : null;
}

/** 回到 App、网络恢复：等着重试的立刻再试 */
function resumeNow() {
  let changed = false;
  items = items.map((i) => (i.status === 'queued' && i.retryAt ? ((changed = true), { ...i, retryAt: undefined }) : i));
  if (changed) emit();
  pump();
}
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (s) => s === 'active' && resumeNow());
  if (Platform.OS === 'web' && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('online', resumeNow);
    globalThis.document?.addEventListener('visibilitychange', () => globalThis.document?.visibilityState === 'visible' && resumeNow());
  }
}

/** 正在传的每一项的取消开关 */
const aborts = new Map<string, AbortController>();
const alive = (id: string) => items.some((i) => i.id === id);

async function work(item: UploadItem) {
  const { id, media: m, albumId } = item;
  const ctl = new AbortController();
  aborts.set(id, ctl);
  update(id, { status: 'uploading', progress: 0, error: undefined, retryAt: undefined });
  try {
    const [u] = await uploadMedia([m], {
      original: true,
      signal: ctl.signal,
      onProgress: (p) => alive(id) && update(id, { progress: p }),
      onStage: (s) => alive(id) && update(id, { status: s === 'processing' ? 'processing' : 'uploading' }),
    });
    // 传完了但已经被取消：不登记到相册（文件由服务器的定期清理删掉）
    if (ctl.signal.aborted || !alive(id)) return;
    // 按上传时间：用排进队列的时间（每项差 1 毫秒），不管哪项先传完，都按选择的顺序排
    const takenAt = item.dateMode === 'upload' ? new Date(item.addedAt).toISOString() : (u.takenAt ?? null);
    await api.post('/api/gallery', {
      albumId,
      items: [{ kind: u.kind, image: u.image, video: u.video, original: u.original ?? null, fileName: u.fileName ?? null, width: u.w ?? null, height: u.h ?? null, duration: u.duration ?? null, size: u.size ?? null, takenAt }],
    });
    update(id, { status: u.instant ? 'instant' : 'done', progress: 1 });
    invalidate('gallery');
    void deleteUpload(id);
  } catch (e) {
    if (isCancelled(e) || ctl.signal.aborted || !alive(id)) return;
    const attempts = item.attempts + 1;
    // 网络问题（断网、切到后台被系统掐断）或服务器临时出错：过一会儿自动重试
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500) && attempts < MAX_ATTEMPTS) {
      update(id, { status: 'queued', attempts, progress: 0, retryAt: Date.now() + Math.min(60_000, 2000 * 2 ** attempts), error: '上传中断，稍后自动重试' });
    } else {
      update(id, { status: 'failed', attempts, error: (e as Error).message });
    }
  } finally {
    aborts.delete(id);
  }
}

function finished() {
  const s = job;
  if (!s) {
    // 全部取消了：相册数量可能变过（取消前已经传完的几张）
    invalidate('albums');
    return;
  }
  invalidate('albums');
  const parts = [s.instant ? `其中 ${s.instant} 项快速上传` : ''].filter(Boolean);
  if (s.failed) toast(`${s.failed} 项没传上去`, '⚠️', '可在上传列表中重试');
  else {
    haptic.success();
    toast(`已上传 ${s.total} 项`, '✓', parts.join(''));
  }
  // 过一会儿把传完的收起来（失败的留着，方便重试）
  setTimeout(() => {
    if (items.some((i) => ACTIVE.includes(i.status))) return;
    clearFinished();
  }, 4000);
}

// ---------------- 对外
/** 把选好的照片 / 视频排进上传队列（可直接放进某个相册） */
export function startGalleryUpload(list: LocalMedia[], albumId?: string, dateMode: DateMode = 'taken') {
  if (!list.length) return;
  listen();
  const now = Date.now();
  const added = list.map((media, n): UploadItem => ({ id: media.key, media, albumId, status: 'queued', progress: 0, attempts: 0, addedAt: now + n, dateMode }));
  items = [...items, ...added];
  emit();
  pump();
  // 存一份到浏览器里，页面被关掉也能接着传
  if (Platform.OS === 'web') void persist(added);
}

async function persist(list: UploadItem[]) {
  for (const it of list) {
    const blob = async (file: Blob | undefined, uri?: string | null) => file ?? (uri ? await fetch(uri).then((r) => r.blob()).catch(() => undefined) : undefined);
    const { uri, videoUri, posterUri, file, videoFile, posterFile, ...meta } = it.media;
    const still = it.media.kind === 'video' ? undefined : await blob(file, uri);
    const rec = { id: it.id, albumId: it.albumId, addedAt: it.addedAt, dateMode: it.dateMode, meta, still, video: await blob(videoFile, videoUri), poster: await blob(posterFile, posterUri) };
    // 已经传完了就不用存了
    if (!items.some((i) => i.id === it.id && ACTIVE.includes(i.status))) continue;
    await saveUpload(rec).catch(() => {});
  }
}

let restored = false;
/** 打开 App 时接着传上次没传完的（网页版） */
export async function restoreUploads() {
  if (restored) return;
  restored = true;
  const saved = (await loadUploads().catch(() => [])).filter((r) => !items.some((i) => i.id === r.id));
  if (!saved.length) return;
  listen();
  const url = (b?: Blob) => (b ? URL.createObjectURL(b) : undefined);
  const added = saved
    .sort((a, b) => a.addedAt - b.addedAt)
    .map((r): UploadItem => {
      const stillUri = url(r.still);
      const posterUri = url(r.poster);
      const media: LocalMedia = { ...r.meta, uri: stillUri ?? posterUri ?? null, videoUri: url(r.video), posterUri: posterUri ?? null, file: r.still, videoFile: r.video, posterFile: r.poster };
      return { id: r.id, media, albumId: r.albumId, status: 'queued', progress: 0, attempts: 0, addedAt: r.addedAt, dateMode: r.dateMode };
    });
  items = [...items, ...added];
  emit();
  toast(`接着上传上次没传完的 ${added.length} 项`, '☁️');
  pump();
}

export function retryUpload(id: string) {
  update(id, { status: 'queued', attempts: 0, retryAt: undefined, error: undefined, progress: 0 });
  pump();
}

export function retryFailed() {
  items = items.map((i) => (i.status === 'failed' ? { ...i, status: 'queued', attempts: 0, retryAt: undefined, error: undefined, progress: 0 } : i));
  emit();
  pump();
}

/** 取消还没开始 / 失败的一项 */
export function removeUpload(id: string) {
  const it = items.find((i) => i.id === id);
  if (!it || it.status === 'uploading' || it.status === 'processing') return;
  items = items.filter((i) => i.id !== id);
  emit();
  releaseLocal([it.media]);
  void deleteUpload(id);
}

/** 一键取消：正在传的立刻中断，排队 / 失败的全部移除；已经传完的保留在相册里 */
export function cancelAll() {
  const gone = items.filter((i) => i.status !== 'done' && i.status !== 'instant');
  if (!gone.length) return;
  for (const it of gone) aborts.get(it.id)?.abort();
  items = items.filter((i) => !gone.includes(i));
  emit();
  pump();
  releaseLocal(gone.map((i) => i.media));
  for (const it of gone) void deleteUpload(it.id);
  if (!items.length) invalidate('albums');
  toast(`已取消 ${gone.length} 项上传`, '✓');
}

/** 收起已经传完的 */
export function clearFinished() {
  const gone = items.filter((i) => i.status === 'done' || i.status === 'instant');
  if (!gone.length) return;
  items = items.filter((i) => !gone.includes(i));
  emit();
  releaseLocal(gone.map((i) => i.media));
}

// ---------------- 选好之后的确认弹层（缩略图 + 日期以什么为准）
export type PendingUpload = { list: LocalMedia[]; albumId?: string };
let pending: PendingUpload | null = null;
const pendingListeners = new Set<() => void>();
function setPending(p: PendingUpload | null) {
  pending = p;
  pendingListeners.forEach((l) => l());
}
/** 等待确认的一批（UploadConfirm 用） */
export function usePendingUpload() {
  return useSyncExternalStore(
    (cb) => {
      pendingListeners.add(cb);
      return () => void pendingListeners.delete(cb);
    },
    () => pending
  );
}

const DATE_MODE_KEY = 'gallery:dateMode';
export async function loadDateMode(): Promise<DateMode> {
  const v = await AsyncStorage.getItem(DATE_MODE_KEY).catch(() => null);
  return v === 'upload' ? 'upload' : 'taken';
}

/** 确认上传：记住这次选的日期方式，排进上传队列 */
export function confirmPendingUpload(dateMode: DateMode) {
  const p = pending;
  setPending(null);
  if (!p) return;
  void AsyncStorage.setItem(DATE_MODE_KEY, dateMode).catch(() => {});
  startGalleryUpload(p.list, p.albumId, dateMode);
}

export function dismissPendingUpload() {
  const p = pending;
  setPending(null);
  if (p) releaseLocal(p.list);
}

/** 选照片 / 视频，确认后在后台上传到共享相册（可直接放进某个相册） */
export async function uploadToGallery(albumId?: string) {
  const picked = await pickMedia({ max: 300 });
  if (!picked.length) return;
  setPending({ list: picked, albumId });
}
