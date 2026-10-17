import { Platform } from 'react-native';

import { ApiError, getBaseUrl, getToken } from './api';

/**
 * 上传文件到 /api/files。
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

export type UploadOptions = {
  /** 0~1 */
  onProgress?: (p: number) => void;
  /** 保留原图（相册用）：不在浏览器里压缩 */
  original?: boolean;
};

// 第二档：服务器说文件太大时，再压一次重试
const LEVELS = [
  { edge: 2400, quality: 0.86 },
  { edge: 1600, quality: 0.72 },
];
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
export async function compressImage(blob: Blob, level = 0): Promise<Blob> {
  const { edge, quality } = LEVELS[Math.min(level, LEVELS.length - 1)];
  if (!blob.type.startsWith('image/') || blob.type === 'image/gif' || blob.type === 'image/svg+xml') return blob;
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
  return out && out.size < blob.size ? out : blob;
}

async function webBlob(input: UploadInput, original: boolean, level: number): Promise<{ blob: Blob; name: string }> {
  let blob: Blob;
  try {
    blob = await (await fetch(input.uri)).blob();
  } catch {
    throw new ApiError('读取不到这个文件了，请重新选择', 0);
  }
  if (input.mime && !blob.type) blob = new Blob([blob], { type: input.mime });
  const keep = original || (await hasEmbeddedVideo(blob));
  const out = keep ? blob : await compressImage(blob, level);
  const ext = out.type === 'image/jpeg' ? 'jpg' : (input.name?.split('.').pop() ?? out.type.split('/')[1] ?? 'bin');
  const base = (input.name ?? 'file').replace(/\.[^.]+$/, '') || 'file';
  return { blob: out, name: `${base}.${ext}` };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

function send(form: FormData, total: number, onProgress?: (p: number) => void, query = '') {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBaseUrl()}/api/files${query}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => onProgress?.(e.lengthComputable ? e.loaded / e.total : 0);
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

async function buildForm(inputs: UploadInput[], original: boolean, level: number) {
  const form = new FormData();
  let total = 0;
  for (const [i, input] of inputs.entries()) {
    if (Platform.OS === 'web') {
      const { blob, name } = await webBlob(input, original, level);
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
  let { form, total } = await buildForm(inputs, original, 0);
  try {
    return (await send(form, total, opts.onProgress, query)) as T;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // 服务器嫌大：网页上再压缩一档重试
    if (e.status === 413 && !original && Platform.OS === 'web') {
      ({ form, total } = await buildForm(inputs, original, 1));
      return (await send(form, total, opts.onProgress, query)) as T;
    }
    if (e.status !== 0) throw e;
    // 网络抖动：等一下再试一次
    await new Promise((r) => setTimeout(r, 1200));
    try {
      return (await send(form, total, opts.onProgress, query)) as T;
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
