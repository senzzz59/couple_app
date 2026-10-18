import type { FastifyInstance, FastifyReply } from 'fastify';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp, { type Metadata } from 'sharp';

import { env } from './env.ts';
import { exifTakenAt, findEmbeddedVideo, videoExt } from './media.ts';
import { s3ConfigFrom, Storage, contentTypeOf, type Area } from './storage.ts';
import { displaySize, enqueueVideo, ffmpegAvailable, makePoster, onVideoSettled, probeVideo, videoIsMp4, videoPlan, videoSettled } from './transcode.ts';

const THUMB_DIR = path.join(env.uploadDir, 'thumb');
const ORIG_DIR = path.join(env.uploadDir, 'orig');
export const FILE_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp|mp4|mov|webm|m4v|3gp)$/;
const ORIG_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic|heif|avif|tif|tiff|dng|mp4|mov|webm|m4v|3gp)$/;
const VIDEO_RE = /\.(mp4|mov|webm|m4v|3gp)$/;
const NAMES: Record<Area, RegExp> = { main: FILE_NAME_RE, thumb: FILE_NAME_RE, orig: ORIG_RE };

/** 对象存储：没配置时 storage.enabled 为 false，文件只放本地 */
export const storage = new Storage(env.uploadDir, s3ConfigFrom(process.env));
// 主目录里的视频要等转码（或确认不用转）之后再搬走
storage.videoReady = async (name) => !(await ffmpegAvailable()) || videoSettled(name);
storage.contentType = (area, name) => contentTypeOf(name, area === 'main' && videoIsMp4(name));
onVideoSettled((name) => storage.offload('main', name));

/** 把刚写好的本地文件交给对象存储（转码中的视频由转码队列完成后再交） */
async function offloadWritten(files: string[]) {
  if (!storage.enabled) return;
  const ffmpeg = await ffmpegAvailable();
  for (const f of files) {
    const area: Area = path.dirname(f) === THUMB_DIR ? 'thumb' : path.dirname(f) === ORIG_DIR ? 'orig' : 'main';
    const name = path.basename(f);
    if (area === 'main' && VIDEO_RE.test(name) && ffmpeg && !videoSettled(name)) continue;
    storage.offload(area, name);
  }
}

/** 启动后：连接对象存储，把以前存在本地的文件搬过去；之后每小时补一次漏（比如上次上传失败的） */
export async function initStorage(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }) {
  if (!storage.enabled) return;
  await storage.init(log);
  const sweep = async () => {
    const count = await storage.migrateLocal(NAMES);
    if (count) log.info({ count }, 'object storage: uploading local files');
  };
  await sweep();
  setInterval(() => void sweep().catch(() => {}), 60 * 60_000).unref();
}

const IMAGE_LIMIT = 60 * 1024 * 1024;
const VIDEO_LIMIT = 500 * 1024 * 1024;

export type UploadedItem = {
  kind: 'image' | 'video' | 'live';
  /** 展示图（视频没有，由前端截取封面后另外上传） */
  image: string | null;
  video: string | null;
  original: string | null;
  fileName: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  size: number;
  takenAt: string | null;
};

const ORIG_EXT: Record<string, string> = { jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', heif: 'heic', avif: 'avif', tiff: 'tif' };

/**
 * 上传：
 * - 图片自动按 EXIF 摆正、限制最长边 2400px、生成 600px 缩略图；?original=1 时额外保留原图（相册下载用）
 * - 视频原样保存（最大 500MB），支持断点续传式的 Range 播放
 * - 安卓「动态照片」会拆出里面的视频，变成 Live 图
 * 文件名是随机 UUID（不可猜测），通过 /files/<name>、/files/thumb/<name>、/files/orig/<name> 访问。
 */
export async function fileRoutes(app: FastifyInstance) {
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(ORIG_DIR, { recursive: true });

  app.post('/api/files', { preHandler: app.authenticate }, async (req, reply) => {
    const keepOriginal = (req.query as { original?: string }).original === '1';
    const names: string[] = [];
    const items: UploadedItem[] = [];
    const written: string[] = [];
    try {
      for await (const part of req.files({ limits: { fileSize: VIDEO_LIMIT, files: 30 } })) {
        const vext = videoExt(part.mimetype, part.filename);
        if (vext) {
          const name = `${crypto.randomUUID()}.${vext}`;
          const target = path.join(env.uploadDir, name);
          written.push(target);
          await pipeline(part.file, createWriteStream(target));
          if (part.file.truncated) return reply.code(413).send({ message: `视频太大了（最大 500MB）：${part.filename}` });
          const { size } = await fs.stat(target);
          const item: UploadedItem = { kind: 'video', image: null, video: name, original: null, fileName: part.filename, width: null, height: null, duration: null, size, takenAt: null };
          if (await ffmpegAvailable()) {
            const probe = await probeVideo(target);
            if (probe) {
              Object.assign(item, displaySize(probe), { duration: probe.duration });
              // 要转码的视频，相册上传时先留一份原片供下载
              if (keepOriginal && videoPlan(probe) !== 'ok') {
                const original = `${crypto.randomUUID()}.${vext}`;
                await fs.link(target, path.join(ORIG_DIR, original)).catch(() => fs.copyFile(target, path.join(ORIG_DIR, original)));
                written.push(path.join(ORIG_DIR, original));
                item.original = original;
              }
            }
            // 服务器截封面：浏览器解不了 HEVC 时前端截不到，这里兜底
            const poster = `${crypto.randomUUID()}.jpg`;
            if (await makePoster(target, path.join(env.uploadDir, poster))) {
              written.push(path.join(env.uploadDir, poster));
              await sharp(path.join(env.uploadDir, poster)).resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(THUMB_DIR, poster));
              written.push(path.join(THUMB_DIR, poster));
              item.image = poster;
            }
            enqueueVideo(name, req.log);
          }
          names.push(name);
          items.push(item);
          continue;
        }

        const buf = await part.toBuffer();
        if (buf.length > IMAGE_LIMIT) return reply.code(413).send({ message: `图片太大了（最大 60MB）：${part.filename}` });
        const isGif = part.mimetype === 'image/gif';
        const id = crypto.randomUUID();
        const name = `${id}.${isGif ? 'gif' : 'jpg'}`;
        let meta: Metadata;
        try {
          meta = await sharp(buf, { failOn: 'none' }).metadata();
          if (isGif) {
            await fs.writeFile(path.join(env.uploadDir, name), buf);
          } else {
            const img = sharp(buf, { failOn: 'none' }).rotate();
            await img.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(env.uploadDir, name));
          }
          written.push(path.join(env.uploadDir, name));
          await sharp(buf, { failOn: 'none', animated: false }).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(THUMB_DIR, name));
          written.push(path.join(THUMB_DIR, name));
        } catch (e) {
          req.log.warn({ err: e, mimetype: part.mimetype, filename: part.filename }, 'image processing failed');
          return reply.code(400).send({ message: `无法识别的图片格式：${part.filename}` });
        }

        let original: string | null = null;
        if (keepOriginal) {
          original = `${id}.${ORIG_EXT[meta.format ?? ''] ?? 'jpg'}`;
          await fs.writeFile(path.join(ORIG_DIR, original), buf);
          written.push(path.join(ORIG_DIR, original));
        }

        // 安卓动态照片：JPEG 后面接着一段 MP4
        let video: string | null = null;
        const embedded = meta.format === 'jpeg' ? findEmbeddedVideo(buf) : -1;
        if (embedded > 0) {
          video = `${id}.mp4`;
          await fs.writeFile(path.join(env.uploadDir, video), buf.subarray(embedded));
          written.push(path.join(env.uploadDir, video));
          // 三星等机型的动态照片是 HEVC，转成 iPhone 也能播的格式
          if (await ffmpegAvailable()) enqueueVideo(video, req.log);
        }

        const swap = (meta.orientation ?? 1) >= 5;
        names.push(name);
        items.push({
          kind: video ? 'live' : 'image',
          image: name,
          video,
          original,
          fileName: part.filename,
          width: (swap ? meta.height : meta.width) ?? null,
          height: (swap ? meta.width : meta.height) ?? null,
          duration: null,
          size: buf.length,
          takenAt: exifTakenAt(meta.exif, env.tz)?.toISOString() ?? null,
        });
      }
    } catch (e) {
      // 中途失败：把已经写下的文件清掉，避免留下孤儿文件
      await Promise.all(written.map((f) => fs.rm(f, { force: true })));
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ message: '文件太大了（视频最大 500MB）' });
      throw e;
    }
    void offloadWritten(written);
    return { files: names, items };
  });

  const serve = (area: Area, re: RegExp) => async (req: { params: unknown; query: unknown }, reply: FastifyReply) => {
    const { name } = req.params as { name: string };
    if (!re.test(name)) return reply.code(404).send();
    const dir = storage.dir(area);
    const dl = (req.query as { dl?: string }).dl;
    const safe = dl ? dl.replace(/[\r\n"\\/]/g, '_').slice(0, 150) || name : undefined;
    const local = await fs.stat(path.join(dir, name)).catch(() => null);
    if (!local && storage.enabled) {
      // 已经搬到对象存储：跳转到临时签名链接，由对象存储直接把文件发给浏览器
      const { url, cacheSeconds } = await storage.signedUrl(area, name, { download: safe });
      reply.header('Cache-Control', `private, max-age=${cacheSeconds}`);
      return reply.redirect(url, 302);
    }
    if (safe) reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
    const isVideo = VIDEO_RE.test(name);
    if (isVideo && area === 'main') {
      // 转码后内容是 MP4（扩展名不变）；转码完成前不长期缓存，免得浏览器一直留着播不了的旧版本
      // 文件不在了要先返回 404：提前设好的 video/mp4 头会让默认的 404 响应出错
      if (!local) return reply.code(404).send();
      const contentType = !videoIsMp4(name);
      if (!contentType) reply.header('Content-Type', 'video/mp4');
      if (!videoSettled(name)) return reply.sendFile(name, dir, { maxAge: 0, contentType });
      return reply.sendFile(name, dir, { maxAge: '365d', immutable: true, contentType });
    }
    // 文件名是随机的、内容永不改变：让浏览器长期缓存
    return reply.sendFile(name, dir, { maxAge: '365d', immutable: true });
  };
  app.get('/files/thumb/:name', serve('thumb', FILE_NAME_RE));
  app.get('/files/orig/:name', serve('orig', ORIG_RE));
  app.get('/files/:name', serve('main', FILE_NAME_RE));
}

/** 打包下载用：文件在本地给路径，在对象存储给读取函数；都没有返回 null */
export async function fileSource(name: string, kind: 'main' | 'orig' = 'main'): Promise<{ path: string } | { open: () => Promise<Readable> } | null> {
  if (!NAMES[kind].test(name)) return null;
  const local = storage.localPath(kind, name);
  if (await fs.stat(local).catch(() => null)) return { path: local };
  if (storage.enabled && (await storage.existsRemote(kind, name))) return { open: () => storage.readRemote(kind, name) };
  return null;
}

async function copyOne(area: Area, from: string, to: string) {
  try {
    await fs.copyFile(storage.localPath(area, from), storage.localPath(area, to));
    storage.offload(area, to);
  } catch (e) {
    // 本地已经没有了：在对象存储里复制
    if (!storage.enabled || (e as { code?: string }).code !== 'ENOENT') throw e;
    await storage.copyRemote(area, from, to);
  }
}

/** 复制一个已上传的文件（连同缩略图），返回新文件名；用于把动态里的照片存进相册 */
export async function copyFile(name: string | null | undefined): Promise<string | null> {
  if (!name || !FILE_NAME_RE.test(name)) return null;
  const next = `${crypto.randomUUID()}${path.extname(name)}`;
  await copyOne('main', name, next);
  await copyOne('thumb', name, next).catch(() => {});
  return next;
}

export async function removeFiles(names: (string | null | undefined)[]) {
  for (const n of names) {
    if (!n || !FILE_NAME_RE.test(n)) continue;
    await storage.remove('main', n);
    await storage.remove('thumb', n);
  }
}

/** 删除相册原图（和展示图同名、放在 orig/ 目录） */
export async function removeOriginals(names: (string | null | undefined)[]) {
  for (const n of names) if (n && ORIG_RE.test(n)) await storage.remove('orig', n);
}
