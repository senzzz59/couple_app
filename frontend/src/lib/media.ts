import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { getBaseUrl } from './api';
import type { GalleryItem, MediaItem } from './types';
import { uploadFiles, type UploadInput, type UploadStage } from './upload';

/**
 * 本地选好的一项媒体（还没上传）。
 * 网页上直接拿 File 对象：能拿到文件名（用来把 Live 图的照片和视频配对）和视频。
 */
export type LocalMedia = {
  key: string;
  kind: 'image' | 'video' | 'live';
  /** 图片 / Live 图的静态照片 / 视频封面（预览用） */
  uri: string | null;
  name: string;
  mime?: string;
  /** 视频或 Live 图的动态部分 */
  videoUri?: string;
  videoName?: string;
  videoMime?: string;
  /** 视频封面（浏览器截取） */
  posterUri?: string | null;
  w?: number;
  h?: number;
  duration?: number;
  /** 文件的修改时间（网页拿不到 EXIF 时的后备拍摄时间） */
  lastModified?: number;
  size?: number;
  /** 网页：原文件本身（上传队列存到浏览器里用，不用再从 blob: 链接读一遍） */
  file?: Blob;
  videoFile?: Blob;
  posterFile?: Blob;
};

let seq = 0;
const key = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
const base = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();
const isVideoFile = (f: { type: string; name: string }) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name);

/** 网页：弹出系统文件选择 */
export function pickFilesWeb(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.onchange = () => finish(Array.from(input.files ?? []));
    // 取消选择时没有 change 事件；浏览器支持的话用 cancel
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** 浏览器里读出视频的尺寸、时长，并截一帧当封面；格式不支持（比如部分浏览器的 HEVC）时封面为空 */
export function probeVideo(uri: string): Promise<{ w?: number; h?: number; duration?: number; poster: Blob | null }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    let settled = false;
    const done = (r: { w?: number; h?: number; duration?: number; poster: Blob | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(r);
    };
    const timer = setTimeout(() => done({ w: video.videoWidth || undefined, h: video.videoHeight || undefined, duration: Number.isFinite(video.duration) ? video.duration : undefined, poster: null }), 8000);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.15, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      if (!w || !h) return done({ duration, poster: null });
      const scale = Math.min(1, 1280 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return done({ w, h, duration, poster: null });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done({ w, h, duration, poster: b }), 'image/jpeg', 0.85);
    };
    video.onerror = () => done({ poster: null });
    video.src = uri;
  });
}

/**
 * 把选中的文件整理成媒体（只做马上能做完的事，选几百张也不用等）：
 * - 同名的照片 + 视频（iPhone 导出的 IMG_1234.HEIC + IMG_1234.MOV）合成一张 Live 图
 * - 视频截封面、读时长放到真正上传前再做（probeLocal），不挡着上传进度出来
 */
export async function prepareFiles(files: File[], allowVideo = true): Promise<LocalMedia[]> {
  const videos = files.filter(isVideoFile);
  const images = files.filter((f) => !isVideoFile(f) && (f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name)));
  // 按名字建索引：几百个文件配对也是一眨眼
  const videoByBase = new Map<string, File[]>();
  for (const v of videos) videoByBase.set(base(v.name), [...(videoByBase.get(base(v.name)) ?? []), v]);
  const imageSet = new Set(images);
  const imageBases = new Set(images.map((f) => base(f.name)));
  const used = new Set<File>();
  const out: LocalMedia[] = [];
  for (const f of files) {
    if (used.has(f)) continue;
    if (imageSet.has(f)) {
      used.add(f);
      const pair = allowVideo ? videoByBase.get(base(f.name))?.find((v) => !used.has(v)) : undefined;
      const uri = URL.createObjectURL(f);
      if (pair) {
        used.add(pair);
        out.push({ key: key(), kind: 'live', uri, name: f.name, mime: f.type, videoUri: URL.createObjectURL(pair), videoName: pair.name, videoMime: pair.type, lastModified: f.lastModified, size: f.size + pair.size, file: f, videoFile: pair });
      } else {
        out.push({ key: key(), kind: 'image', uri, name: f.name, mime: f.type, lastModified: f.lastModified, size: f.size, file: f });
      }
    } else if (isVideoFile(f) && allowVideo && !imageBases.has(base(f.name))) {
      // 有同名照片的视频是 Live 图的动态部分，跟着照片一起处理（不管选的时候谁在前）
      used.add(f);
      out.push({ key: key(), kind: 'video', uri: null, posterUri: null, name: f.name, videoUri: URL.createObjectURL(f), videoName: f.name, videoMime: f.type, lastModified: f.lastModified, size: f.size, videoFile: f });
    }
  }
  return out;
}

const probing = new Map<string, Promise<LocalMedia>>();
/**
 * 网页：补上视频封面、时长和尺寸（浏览器里截一帧）。同一项只做一次；
 * 确认弹层里先显示的几项、上传前都会调用。
 */
export function probeLocal(m: LocalMedia): Promise<LocalMedia> {
  if (Platform.OS !== 'web' || m.kind === 'image' || !m.videoUri) return Promise.resolve(m);
  if (m.kind === 'video' && m.posterUri) return Promise.resolve(m);
  if (m.kind === 'live' && m.duration) return Promise.resolve(m);
  let p = probing.get(m.key);
  if (!p) {
    p = probeVideo(m.videoUri).then((meta) => {
      if (m.kind === 'live') return { ...m, duration: meta.duration };
      const posterUri = meta.poster ? URL.createObjectURL(meta.poster) : null;
      return { ...m, uri: posterUri, posterUri, w: meta.w, h: meta.h, duration: meta.duration, posterFile: meta.poster ?? undefined };
    });
    probing.set(m.key, p);
    void p.finally(() => setTimeout(() => probing.delete(m.key), 60_000));
  }
  return p;
}

/** 选照片 / 视频（网页用文件选择框，原生用系统相册） */
export async function pickMedia(opts: { max: number; video?: boolean }): Promise<LocalMedia[]> {
  const allowVideo = opts.video !== false;
  if (Platform.OS === 'web') {
    const files = await pickFilesWeb(allowVideo ? 'image/*,video/*' : 'image/*', opts.max > 1);
    return (await prepareFiles(files, allowVideo)).slice(0, opts.max);
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: opts.max > 1,
    selectionLimit: opts.max,
    quality: 0.85,
    exif: false,
  });
  if (res.canceled) return [];
  return res.assets.map((a) =>
    a.type === 'video'
      ? { key: key(), kind: 'video' as const, uri: null, name: a.fileName ?? 'video.mp4', videoUri: a.uri, videoName: a.fileName ?? 'video.mp4', videoMime: a.mimeType ?? 'video/mp4', w: a.width, h: a.height, duration: a.duration ? a.duration / 1000 : undefined }
      : { key: key(), kind: 'image' as const, uri: a.uri, name: a.fileName ?? 'photo.jpg', mime: a.mimeType ?? 'image/jpeg', w: a.width, h: a.height }
  );
}

export function releaseLocal(list: LocalMedia[]) {
  if (Platform.OS !== 'web') return;
  for (const m of list) for (const u of [m.uri, m.videoUri, m.posterUri]) if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
}

type ServerItem = { kind: 'image' | 'video' | 'live'; image: string | null; video: string | null; original: string | null; fileName: string; width: number | null; height: number | null; duration?: number | null; size: number; takenAt: string | null };
type UploadResponse = { files: string[]; items?: ServerItem[]; instant?: boolean };

/** instant：快速上传（同一个文件以前传过，服务器直接复制了一份） */
export type UploadedMedia = MediaItem & { original?: string | null; fileName?: string; size?: number; takenAt?: string | null; instant?: boolean };

/**
 * 逐项上传（一项失败不影响已经传完的），返回服务器上的媒体。
 * original：相册用，保留原图供下载。
 */
export async function uploadMedia(list: LocalMedia[], opts: { original?: boolean; onProgress?: (p: number) => void; onStage?: (s: UploadStage) => void; signal?: AbortSignal } = {}): Promise<UploadedMedia[]> {
  const { onStage, signal } = opts;
  const total = list.reduce((s, m) => s + (m.size ?? 1), 0) || 1;
  let done = 0;
  const out: UploadedMedia[] = [];
  const step = (m: LocalMedia, share: number) => (p: number) => opts.onProgress?.(Math.min(1, (done + (m.size ?? 1) * share * p) / total));
  for (const m of list) {
    const lastModified = m.lastModified ? new Date(m.lastModified).toISOString() : null;
    if (m.kind === 'image') {
      const res = await uploadFiles<UploadResponse>([{ uri: m.uri!, name: m.name, mime: m.mime }], { original: opts.original, onProgress: step(m, 1), onStage, signal });
      const it = res.items?.[0];
      out.push({ kind: it?.kind ?? 'image', image: it?.image ?? res.files[0], video: it?.video ?? null, w: it?.width ?? m.w, h: it?.height ?? m.h, original: it?.original, fileName: m.name, size: it?.size ?? m.size, takenAt: it?.takenAt ?? lastModified, instant: !!res.instant });
    } else if (m.kind === 'video') {
      const v = await uploadFiles<UploadResponse>([{ uri: m.videoUri!, name: m.videoName, mime: m.videoMime }], { original: opts.original, onProgress: step(m, 0.95), onStage, signal });
      const it = v.items?.[0];
      // 服务器截的封面优先（iPhone 的 HEVC 视频在很多安卓浏览器里截不到）
      let image: string | null = it?.image ?? null;
      // 服务器截不到封面（没装 ffmpeg）时，才在浏览器里截一帧补上
      const posterUri = image ? null : (await probeLocal(m)).posterUri;
      if (posterUri) image = (await uploadFiles<UploadResponse>([{ uri: posterUri, name: 'poster.jpg', mime: 'image/jpeg' } as UploadInput], { signal })).files[0];
      out.push({ kind: 'video', image, video: it?.video ?? v.files[0], w: it?.width ?? m.w, h: it?.height ?? m.h, duration: it?.duration ?? m.duration, original: it?.original ?? null, fileName: m.videoName, size: it?.size ?? m.size, takenAt: lastModified, instant: !!v.instant });
    } else {
      const still = await uploadFiles<UploadResponse>([{ uri: m.uri!, name: m.name, mime: m.mime }], { original: opts.original, onProgress: step(m, 0.4), onStage, signal });
      const vid = await uploadFiles<UploadResponse>([{ uri: m.videoUri!, name: m.videoName, mime: m.videoMime }], { onProgress: step(m, 0.6), onStage, signal });
      const it = still.items?.[0];
      out.push({ kind: 'live', image: it?.image ?? still.files[0], video: vid.items?.[0]?.video ?? vid.files[0], w: it?.width ?? m.w, h: it?.height ?? m.h, duration: vid.items?.[0]?.duration ?? m.duration, original: it?.original, fileName: m.name, size: m.size, takenAt: it?.takenAt ?? lastModified, instant: !!still.instant && !!vid.instant });
    }
    done += m.size ?? 1;
    opts.onProgress?.(Math.min(1, done / total));
  }
  return out;
}

/** 服务器文件的地址 */
export function mediaUrl(name: string | null | undefined, variant: 'full' | 'thumb' | 'orig' = 'full') {
  if (!name) return undefined;
  return `${getBaseUrl()}/files/${variant === 'thumb' ? 'thumb/' : variant === 'orig' ? 'orig/' : ''}${name}`;
}

export const galleryToMedia = (g: GalleryItem): MediaItem => ({ kind: g.kind, image: g.image, video: g.video, w: g.width, h: g.height, duration: g.duration });

export function fmtDuration(s?: number | null) {
  if (!s || !Number.isFinite(s)) return '';
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, '0')}`;
}

export function fmtSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
