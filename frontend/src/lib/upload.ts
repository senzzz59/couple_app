import { Platform } from 'react-native';

import { api, ApiError, getBaseUrl, getToken } from './api';

/**
 * 上传文件。
 * - 服务器配置了对象存储时，网页把文件直接传到对象存储（不占服务器带宽），再通知服务器处理；
 *   直传失败（比如对象存储不允许跨域）就自动改走服务器 /api/files，这次打开页面不再尝试直传。
 * - 网页版先在浏览器里把大图压到最长边 2400px 的 JPEG（服务器最终也是这个规格），
 *   一张几 MB 的截图 / PNG 通常只剩几百 KB，上传更快，也不容易被服务器的上传大小限制拦下。
 * - 用 XMLHttpRequest 上传，可以显示进度，并且能分清是网络断了还是文件太大。
 * - 网络中断时自动重试一次。
 */

export type UploadInput = {
  /** 本地 uri（网页上是 blob: / data:） */
  uri: string;
  /** 原始文件名，用来判断类型 */
  name?: string;
  mime?: string;
};

/** 上传到了哪一步：传文件中 / 服务器处理中 / 快速上传（同一个文件以前传过，直接复制） */
export type UploadStage = 'uploading' | 'processing' | 'instant';

export type UploadOptions = {
  /** 0~1 */
  onProgress?: (p: number) => void;
  onStage?: (stage: UploadStage) => void;
  /** 保留原图（相册用）：不在浏览器里压缩 */
  original?: boolean;
};

// 第二档：服务器说文件太大时，再压一次重试
const LEVELS = [
  { edge: 2400, quality: 0.86 },
  { edge: 1600, quality: 0.72 },
];
// HEIC 转 JPEG：保留原尺寸
const HEIC_LEVEL = { edge: 100000, quality: 0.92 };
const isHeic = (blob: Blob, name?: string) => /image\/hei[cf]/i.test(blob.type) || /\.hei[cf]$/i.test(name ?? '');
const COMPRESS_OVER = 900 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadBitmap(blob: Blob): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
    } catch {
      // 某些格式 createImageBitmap 不支持，退回 <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
  } catch {
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 安卓「动态照片」：JPEG 后面藏着一段 MP4，压缩会把它弄丢 */
export async function hasEmbeddedVideo(blob: Blob) {
  if (!/jpe?g/i.test(blob.type) || blob.size < 200 * 1024) return false;
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 8 * 1024 * 1024)).arrayBuffer());
  for (let i = 0; i < tail.length - 8; i++) {
    // 'ftyp'
    if (tail[i] === 0x66 && tail[i + 1] === 0x74 && tail[i + 2] === 0x79 && tail[i + 3] === 0x70) {
      const brand = String.fromCharCode(tail[i + 4], tail[i + 5], tail[i + 6], tail[i + 7]);
      if (/^(mp4|isom|iso\d|avc1|qt  |mp42|M4V )/.test(brand)) return true;
    }
  }
  return false;
}

/** 浏览器里压缩图片；不是图片、GIF、或者压完反而更大时原样返回 */
export async function compressImage(blob: Blob, level: number | 'heic' = 0): Promise<Blob> {
  const { edge, quality } = level === 'heic' ? HEIC_LEVEL : LEVELS[Math.min(level, LEVELS.length - 1)];
  if (level !== 'heic' && (!blob.type.startsWith('image/') || blob.type === 'image/gif' || blob.type === 'image/svg+xml')) return blob;
  const bmp = await loadBitmap(blob);
  if (!bmp || !bmp.w || !bmp.h) return blob;
  const scale = Math.min(1, edge / Math.max(bmp.w, bmp.h));
  if (scale === 1 && blob.size <= COMPRESS_OVER && level === 0) return blob;
  const w = Math.round(bmp.w * scale);
  const h = Math.round(bmp.h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  // PNG 透明背景压成 JPEG 会变黑，先铺白
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  bmp.draw(ctx, w, h);
  const out = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (level === 'heic') return out ?? blob;
  return out && out.size < blob.size ? out : blob;
}

async function webBlob(input: UploadInput, original: boolean, level: number): Promise<Prepared> {
  let blob: Blob;
  try {
    blob = await (await fetch(input.uri)).blob();
  } catch {
    throw new ApiError('读取不到这个文件了，请重新选择', 0);
  }
  // 浏览器常常不给 .MOV / .HEIC 填类型：按扩展名补上，服务器才知道这是视频
  const guessed = input.mime || MIME_BY_EXT[(input.name ?? '').split('.').pop()?.toLowerCase() ?? ''];
  if (guessed && (!blob.type || blob.type === 'text/plain' || blob.type === 'application/octet-stream')) blob = new Blob([blob], { type: guessed });
  let out: Blob;
  if (isHeic(blob, input.name)) {
    // 服务器读不了 HEIC：浏览器能解码（Safari）就转成 JPEG
    out = await compressImage(blob, original ? 'heic' : level);
    if (out === blob || out.type !== 'image/jpeg') throw new ApiError(`这个浏览器打不开 HEIC 照片（${input.name ?? ''}）。用 iPhone 直接从相册选，或在 Safari 里上传`, 415);
  } else {
    const keep = original || (await hasEmbeddedVideo(blob));
    out = keep ? blob : await compressImage(blob, level);
  }
  const ext = out.type === 'image/jpeg' ? 'jpg' : (input.name?.split('.').pop() ?? out.type.split('/')[1] ?? 'bin');
  const base = (input.name ?? 'file').replace(/\.[^.]+$/, '') || 'file';
  return { blob: out, name: `${base}.${ext}`, source: blob };
}

const MIME_BY_EXT: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

function send(form: FormData, total: number, onProgress?: (p: number) => void, query = '', onStage?: (s: UploadStage) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBaseUrl()}/api/files${query}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => onProgress?.(e.lengthComputable ? e.loaded / e.total : 0);
    // 文件传完了，服务器在压缩 / 截封面
    xhr.upload.onload = () => onStage?.('processing');
    xhr.onload = () => {
      let data: { message?: string } | null = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // nginx 的错误页是 HTML
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) return resolve(data);
      if (xhr.status === 413) return reject(new ApiError(`文件太大（${mb(total)}），服务器拒收了。需要在服务器的 nginx 里调大 client_max_body_size`, 413));
      if (xhr.status === 401) return reject(new ApiError('登录已过期，请重新登录', 401));
      reject(new ApiError(data?.message ?? `上传失败（${xhr.status}）`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('network', 0));
    xhr.ontimeout = () => reject(new ApiError('network', 0));
    xhr.timeout = 30 * 60 * 1000;
    xhr.send(form);
  });
}

/** source：用户选的原文件（压缩前），用来算指纹 */
type Prepared = { blob: Blob; name: string; source?: Blob };
type DirectTicket = { id: string; url: string; headers: Record<string, string> } | { instant: unknown; id?: undefined };
type ServerItem = { kind: string; image: string | null; video: string | null };

/**
 * 文件指纹（快速上传用）：16MB 以内整个算 sha256；更大的取开头、中间、结尾各 4MB 再加上文件大小，
 * 几百 MB 的视频也只要一眨眼。和以前传过的文件一样，就不用再传一遍。
 */
export async function fingerprint(blob: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !blob.size) return undefined;
  try {
    const chunk = 4 * 1024 * 1024;
    const mid = Math.floor(blob.size / 2);
    const parts = blob.size <= 4 * chunk ? [blob] : [blob.slice(0, chunk), blob.slice(mid - chunk / 2, mid + chunk / 2), blob.slice(blob.size - chunk)];
    const digest = new Uint8Array(await subtle.digest('SHA-256', await new Blob(parts).arrayBuffer()));
    return `v1:${blob.size}:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return undefined;
  }
}

/**
 * 直传从来没成功过就失败（多半是对象存储不允许跨域）：本次打开页面都走服务器。
 * 成功过就说明直传是通的，之后的失败只是网络抖动 / 切到后台被掐断：重试，不改走服务器（那样上传和处理都要占服务器带宽）。
 */
let directOff = false;
let directWorked = false;

function put(url: string, blob: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`上传失败（${xhr.status}）`, xhr.status)));
    xhr.onerror = () => reject(new ApiError('network', 0));
    xhr.ontimeout = () => reject(new ApiError('network', 0));
    xhr.timeout = 30 * 60 * 1000;
    xhr.send(blob);
  });
}

/** 直传到对象存储；返回 null 表示这次不能直传，调用方改走服务器 */
async function sendDirect(files: Prepared[], original: boolean, onProgress?: (p: number) => void, onStage?: (s: UploadStage) => void): Promise<unknown | null> {
  if (directOff || Platform.OS !== 'web') return null;
  let tickets: DirectTicket[] | undefined;
  const hashes = await Promise.all(files.map((f) => fingerprint(f.source ?? f.blob)));
  try {
    const res = await api.post<{ enabled: boolean; uploads?: DirectTicket[] }>('/api/files/direct', { original, files: files.map((f, i) => ({ name: f.name, type: f.blob.type, size: f.blob.size, hash: hashes[i] })) });
    tickets = res.enabled ? res.uploads : undefined;
  } catch {
    return null;
  }
  if (!tickets || tickets.length !== files.length) return null;
  const items: (ServerItem | null)[] = tickets.map((t) => ('instant' in t ? (t.instant as ServerItem) : null));
  const pending = tickets.flatMap((t, i) => ('url' in t ? [{ t, i }] : []));
  // 全是以前传过的：直接用复制好的
  if (!pending.length) {
    onStage?.('instant');
    onProgress?.(1);
    return { files: items.map((it) => (it!.kind === 'video' ? it!.video : it!.image)), items, instant: true };
  }
  const total = pending.reduce((n, { i }) => n + files[i].blob.size, 0) || 1;
  let done = 0;
  onStage?.('uploading');
  for (const { t, i } of pending) {
    if (!('url' in t)) continue;
    const progress = (loaded: number) => onProgress?.(((done + loaded) / total) * 0.95);
    try {
      await put(t.url, files[i].blob, t.headers, progress).catch(async (e) => {
        // 网络抖了一下：等一会儿再传一次
        if (!(e instanceof ApiError && e.status === 0)) throw e;
        await new Promise((r) => setTimeout(r, 1500));
        await put(t.url, files[i].blob, t.headers, progress);
      });
    } catch (e) {
      if (directWorked) throw e instanceof ApiError ? e : new ApiError('network', 0);
      // 从来没直传成功过：多半是对象存储不允许跨域，这次打开页面都走服务器
      if (e instanceof ApiError && e.status === 0) directOff = true;
      return null;
    }
    directWorked = true;
    done += files[i].blob.size;
  }
  try {
    onStage?.('processing');
    const out = await api.post<{ items: ServerItem[] }>('/api/files/complete', { uploads: pending.map(({ t, i }) => ({ id: t.id, name: files[i].name, hash: hashes[i] })), original });
    pending.forEach(({ i }, n) => (items[i] = out.items[n]));
    onProgress?.(1);
    return { files: items.map((it) => (it!.kind === 'video' ? it!.video : it!.image)), items };
  } catch (e) {
    // 文件已经在对象存储里了：不再经服务器重传一遍，把错误交给调用方（相册上传队列会自动重试）
    throw e instanceof ApiError ? e : new ApiError('network', 0);
  }
}

async function buildForm(inputs: UploadInput[], original: boolean, level: number, prepared?: Prepared[]) {
  const form = new FormData();
  let total = 0;
  for (const [i, input] of inputs.entries()) {
    if (Platform.OS === 'web') {
      const { blob, name } = prepared?.[i] ?? (await webBlob(input, original, level));
      total += blob.size;
      form.append('file', blob, name);
    } else {
      const name = input.name ?? `photo-${i}.jpg`;
      form.append('file', { uri: input.uri, name, type: input.mime ?? 'image/jpeg' } as unknown as Blob);
    }
  }
  return { form, total };
}

/** 上传一组文件，返回服务器的响应 */
export async function uploadFiles<T = { files: string[] }>(inputs: UploadInput[], opts: UploadOptions = {}): Promise<T> {
  const original = !!opts.original;
  const query = original ? '?original=1' : '';
  let prepared: Prepared[] | undefined;
  if (Platform.OS === 'web' && !directOff) {
    prepared = [];
    for (const input of inputs) prepared.push(await webBlob(input, original, 0));
    const direct = await sendDirect(prepared, original, opts.onProgress, opts.onStage);
    if (direct) return direct as T;
  }
  opts.onStage?.('uploading');
  let { form, total } = await buildForm(inputs, original, 0, prepared);
  try {
    return (await send(form, total, opts.onProgress, query, opts.onStage)) as T;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // 服务器嫌大：网页上再压缩一档重试
    if (e.status === 413 && !original && Platform.OS === 'web') {
      ({ form, total } = await buildForm(inputs, original, 1));
      return (await send(form, total, opts.onProgress, query, opts.onStage)) as T;
    }
    if (e.status !== 0) throw e;
    // 网络抖动：等一下再试一次
    await new Promise((r) => setTimeout(r, 1200));
    try {
      return (await send(form, total, opts.onProgress, query, opts.onStage)) as T;
    } catch (e2) {
      if (e2 instanceof ApiError && e2.status === 0) {
        throw new ApiError(
          total > 1024 * 1024
            ? `上传中断了（${mb(total)}）。可能是网络不稳定，或者服务器限制了上传大小`
            : '上传中断了，检查一下网络再试试',
          0
        );
      }
      throw e2;
    }
  }
}

/** 上传本地图片，返回服务器上的文件名 */
export async function uploadImages(uris: string[], onProgress?: (p: number) => void): Promise<string[]> {
  if (!uris.length) return [];
  const res = await uploadFiles<{ files: string[] }>(
    uris.map((uri, i) => ({ uri, name: `photo-${i}.jpg` })),
    { onProgress }
  );
  return res.files;
}
