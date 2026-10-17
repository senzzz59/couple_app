import type { FastifyInstance, FastifyReply } from 'fastify';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp, { type Metadata } from 'sharp';

import { env } from './env.ts';
import { exifTakenAt, findEmbeddedVideo, videoExt } from './media.ts';

const THUMB_DIR = path.join(env.uploadDir, 'thumb');
const ORIG_DIR = path.join(env.uploadDir, 'orig');
export const FILE_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp|mp4|mov|webm|m4v|3gp)$/;
const ORIG_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic|heif|avif|tif|tiff|dng)$/;
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
          names.push(name);
          items.push({ kind: 'video', image: null, video: name, original: null, fileName: part.filename, width: null, height: null, size, takenAt: null });
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
    return { files: names, items };
  });

  const serve = (dir: string, re: RegExp) => async (req: { params: unknown; query: unknown }, reply: FastifyReply) => {
    const { name } = req.params as { name: string };
    if (!re.test(name)) return reply.code(404).send();
    const dl = (req.query as { dl?: string }).dl;
    if (dl) {
      const safe = dl.replace(/[\r\n"\\/]/g, '_').slice(0, 150) || name;
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
    }
    // 文件名是随机的、内容永不改变：让浏览器长期缓存
    return reply.sendFile(name, dir, { maxAge: '365d', immutable: true });
  };
  app.get('/files/thumb/:name', serve(THUMB_DIR, FILE_NAME_RE));
  app.get('/files/orig/:name', serve(ORIG_DIR, ORIG_RE));
  app.get('/files/:name', serve(env.uploadDir, FILE_NAME_RE));
}

export function filePath(name: string, kind: 'main' | 'orig' = 'main') {
  if (kind === 'orig') return ORIG_RE.test(name) ? path.join(ORIG_DIR, name) : null;
  return FILE_NAME_RE.test(name) ? path.join(env.uploadDir, name) : null;
}

/** 复制一个已上传的文件（连同缩略图），返回新文件名；用于把动态里的照片存进相册 */
export async function copyFile(name: string | null | undefined): Promise<string | null> {
  if (!name || !FILE_NAME_RE.test(name)) return null;
  const next = `${crypto.randomUUID()}${path.extname(name)}`;
  await fs.copyFile(path.join(env.uploadDir, name), path.join(env.uploadDir, next));
  await fs.copyFile(path.join(THUMB_DIR, name), path.join(THUMB_DIR, next)).catch(() => {});
  return next;
}

export async function removeFiles(names: (string | null | undefined)[]) {
  for (const n of names) {
    if (!n || !FILE_NAME_RE.test(n)) continue;
    await fs.rm(path.join(env.uploadDir, n), { force: true });
    await fs.rm(path.join(THUMB_DIR, n), { force: true });
  }
}

/** 删除相册原图（和展示图同名、放在 orig/ 目录） */
export async function removeOriginals(names: (string | null | undefined)[]) {
  for (const n of names) if (n && ORIG_RE.test(n)) await fs.rm(path.join(ORIG_DIR, n), { force: true });
}
