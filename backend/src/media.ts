import type { MediaItem } from './db/schema.ts';

const VIDEO_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
};

/** 是视频就返回保存用的扩展名，否则 null */
export function videoExt(mime: string | undefined, fileName: string | undefined): string | null {
  if (mime && VIDEO_MIME[mime]) return VIDEO_MIME[mime];
  const ext = fileName?.split('.').pop()?.toLowerCase();
  // 有的浏览器给 .MOV 之类的文件不填类型，或者填成 text/plain / octet-stream：按扩展名认，只要它没声称自己是图片
  if (ext && ['mp4', 'mov', 'webm', 'm4v', '3gp'].includes(ext) && !mime?.startsWith('image/')) return ext;
  return null;
}

/**
 * 安卓「动态照片」（Google Motion Photo / 三星 Motion Photo）：
 * 一张正常的 JPEG 后面直接接着一段 MP4。找到 MP4 开头（'ftyp' box）的位置，找不到返回 -1。
 */
export function findEmbeddedVideo(buf: Buffer): number {
  // JPEG 本体至少要有一些字节，MP4 只会出现在后半部分
  const start = Math.min(buf.length, 1024);
  let i = buf.indexOf('ftyp', start, 'latin1');
  while (i > 4) {
    const brand = buf.toString('latin1', i + 4, i + 8);
    const boxSize = buf.readUInt32BE(i - 4);
    if (/^(mp4\d|isom|iso\d|avc1|mp42|qt  |M4V )/.test(brand) && boxSize >= 8 && boxSize < 512) return i - 4;
    i = buf.indexOf('ftyp', i + 4, 'latin1');
  }
  return -1;
}

/** 某个时区在某一时刻相对 UTC 的偏移（分钟） */
function tzOffsetMinutes(tz: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * 从 EXIF 里读拍摄时间。EXIF 的时间是相机本地时间、不带时区，按 tz 解释。
 * 文件里通常同时有拍摄时间和修改时间，取最早的那个。
 */
export function exifTakenAt(exif: Buffer | undefined, tz: string): Date | null {
  if (!exif) return null;
  const text = exif.toString('latin1');
  const re = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;
  let best: Date | null = null;
  for (const m of text.matchAll(re)) {
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) continue;
    const naive = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    const at = new Date(naive.getTime() - tzOffsetMinutes(tz, naive) * 60000);
    if (at.getTime() > Date.now() + 864e5) continue;
    if (!best || at < best) best = at;
  }
  return best;
}

/** 旧动态只有 photos；统一成 media 返回 */
export function normalizeMedia(photos: string[] | null | undefined, media: MediaItem[] | null | undefined): MediaItem[] {
  if (media && media.length) return media;
  return (photos ?? []).map((image) => ({ kind: 'image' as const, image }));
}

/** 一组媒体引用到的所有文件 */
export function mediaFiles(media: MediaItem[] | null | undefined): string[] {
  return (media ?? []).flatMap((m) => [m.image, m.video]).filter((f): f is string => !!f);
}

/** 相册列表的翻页游标：拍摄时间|id */
export function galleryCursor(before: string | undefined): { at: Date; id: string } | null {
  if (!before) return null;
  const [at, id, extra] = before.split('|');
  const date = new Date(at);
  if (extra !== undefined || !id || id.length !== 36 || Number.isNaN(date.getTime())) throw Object.assign(new Error('参数不对'), { statusCode: 400 });
  return { at: date, id };
}

type Downloadable = { kind: 'image' | 'video' | 'live'; fileName: string | null; takenAt: Date | string; image: string | null; video: string | null; original: string | null };

/** 下载时的文件名：用户上传时的名字，没有就按拍摄时间起名 */
export function downloadName(r: Downloadable) {
  const file = r.kind === 'video' ? r.video : (r.original ?? r.image);
  const dot = file ? file.lastIndexOf('.') : -1;
  const extension = file && dot > 0 ? file.slice(dot) : '';
  if (r.fileName) {
    const base = r.fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120);
    if (base) return `${base}${extension}`;
  }
  const d = new Date(r.takenAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `us-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${extension}`;
}
