import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { getBaseUrl } from './api';
import type { GalleryItem, MediaItem } from './types';
import { uploadFiles, type UploadInput } from './upload';

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

function imageSize(uri: string): Promise<{ w?: number; h?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = uri;
  });
}

/**
 * 把选中的文件整理成媒体：
 * - 同名的照片 + 视频（iPhone 导出的 IMG_1234.HEIC + IMG_1234.MOV）合成一张 Live 图
 * - 视频截取封面
 */
export async function prepareFiles(files: File[], allowVideo = true): Promise<LocalMedia[]> {
  const videos = files.filter(isVideoFile);
  const images = files.filter((f) => !isVideoFile(f) && (f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name)));
  const used = new Set<File>();
  const out: LocalMedia[] = [];
  for (const f of files) {
    if (used.has(f)) continue;
    if (!isVideoFile(f) && images.includes(f)) {
      const pair = videos.find((v) => !used.has(v) && base(v.name) === base(f.name));
      used.add(f);
      const uri = URL.createObjectURL(f);
      const size = await imageSize(uri);
      if (pair && allowVideo) {
        used.add(pair);
        const videoUri = URL.createObjectURL(pair);
        const meta = await probeVideo(videoUri);
        out.push({ key: key(), kind: 'live', uri, name: f.name, mime: f.type, videoUri, videoName: pair.name, videoMime: pair.type, ...size, duration: meta.duration, lastModified: f.lastModified, size: f.size + pair.size });
      } else {
        out.push({ key: key(), kind: 'image', uri, name: f.name, mime: f.type, ...size, lastModified: f.lastModified, size: f.size });
      }
    } else if (isVideoFile(f) && allowVideo) {
      used.add(f);
      const videoUri = URL.createObjectURL(f);
      const meta = await probeVideo(videoUri);
      const posterUri = meta.poster ? URL.createObjectURL(meta.poster) : null;
      out.push({ key: key(), kind: 'video', uri: posterUri, posterUri, name: f.name, videoUri, videoName: f.name, videoMime: f.type, w: meta.w, h: meta.h, duration: meta.duration, lastModified: f.lastModified, size: f.size });
    }
  }
  return out;
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

type ServerItem = { kind: 'image' | 'video' | 'live'; image: string | null; video: string | null; original: string | null; fileName: string; width: number | null; height: number | null; size: number; takenAt: string | null };
type UploadResponse = { files: string[]; items?: ServerItem[] };

export type UploadedMedia = MediaItem & { original?: string | null; fileName?: string; size?: number; takenAt?: string | null };

/**
 * 逐项上传（一项失败不影响已经传完的），返回服务器上的媒体。
 * original：相册用，保留原图供下载。
 */
export async function uploadMedia(list: LocalMedia[], opts: { original?: boolean; onProgress?: (p: number) => void } = {}): Promise<UploadedMedia[]> {
  const total = list.reduce((s, m) => s + (m.size ?? 1), 0) || 1;
  let done = 0;
  const out: UploadedMedia[] = [];
  const step = (m: LocalMedia, share: number) => (p: number) => opts.onProgress?.(Math.min(1, (done + (m.size ?? 1) * share * p) / total));
  for (const m of list) {
    const lastModified = m.lastModified ? new Date(m.lastModified).toISOString() : null;
    if (m.kind === 'image') {
      const res = await uploadFiles<UploadResponse>([{ uri: m.uri!, name: m.name, mime: m.mime }], { original: opts.original, onProgress: step(m, 1) });
      const it = res.items?.[0];
      out.push({ kind: it?.kind ?? 'image', image: it?.image ?? res.files[0], video: it?.video ?? null, w: it?.width ?? m.w, h: it?.height ?? m.h, original: it?.original, fileName: m.name, size: it?.size ?? m.size, takenAt: it?.takenAt ?? lastModified });
    } else if (m.kind === 'video') {
      const v = await uploadFiles<UploadResponse>([{ uri: m.videoUri!, name: m.videoName, mime: m.videoMime }], { onProgress: step(m, 0.95) });
      let image: string | null = null;
      if (m.posterUri) image = (await uploadFiles<UploadResponse>([{ uri: m.posterUri, name: 'poster.jpg', mime: 'image/jpeg' } as UploadInput])).files[0];
      out.push({ kind: 'video', image, video: v.items?.[0]?.video ?? v.files[0], w: m.w, h: m.h, duration: m.duration, fileName: m.videoName, size: v.items?.[0]?.size ?? m.size, takenAt: lastModified });
    } else {
      const still = await uploadFiles<UploadResponse>([{ uri: m.uri!, name: m.name, mime: m.mime }], { original: opts.original, onProgress: step(m, 0.4) });
      const vid = await uploadFiles<UploadResponse>([{ uri: m.videoUri!, name: m.videoName, mime: m.videoMime }], { onProgress: step(m, 0.6) });
      const it = still.items?.[0];
      out.push({ kind: 'live', image: it?.image ?? still.files[0], video: vid.items?.[0]?.video ?? vid.files[0], w: it?.width ?? m.w, h: it?.height ?? m.h, duration: m.duration, original: it?.original, fileName: m.name, size: m.size, takenAt: it?.takenAt ?? lastModified });
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
