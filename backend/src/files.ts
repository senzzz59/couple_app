import type { FastifyInstance, FastifyReply } from 'fastify';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp, { type Metadata } from 'sharp';
import { z } from 'zod';

import { and, eq } from 'drizzle-orm';

import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { exifTakenAt, findEmbeddedVideo, videoExt } from './media.ts';
import { s3ConfigFrom, Storage, contentTypeOf, type Area } from './storage.ts';
import { displaySize, enqueueVideo, exec, ffmpegAvailable, makePoster, markVideo, onVideoSettled, probeVideo, setVideoFetcher, videoIsMp4, videoPlan, videoSettled, videoStatus } from './transcode.ts';

const THUMB_DIR = path.join(env.uploadDir, 'thumb');
const ORIG_DIR = path.join(env.uploadDir, 'orig');
export const FILE_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp|mp4|mov|webm|m4v|3gp|m4a)$/;
/** 聊天语音 */
export const VOICE_RE = /^[0-9a-f-]{36}\.m4a$/;
export const ORIG_RE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic|heif|avif|tif|tiff|dng|mp4|mov|webm|m4v|3gp)$/;
const VIDEO_RE = /\.(mp4|mov|webm|m4v|3gp)$/;
const NAMES: Record<Area, RegExp> = { main: FILE_NAME_RE, thumb: FILE_NAME_RE, orig: ORIG_RE };

/** 对象存储：没配置时 storage.enabled 为 false，文件只放本地 */
export const storage = new Storage(env.uploadDir, s3ConfigFrom(process.env));
// 主目录里的视频要等转码（或确认不用转）之后再搬走
storage.videoReady = async (name) => !(await ffmpegAvailable()) || videoSettled(name);
storage.contentType = (area, name) => contentTypeOf(name, area === 'main' && videoIsMp4(name));
storage.names = NAMES;
onVideoSettled((name) => storage.offload('main', name));
// 直传的视频要转码时，后台从对象存储取回原片
setVideoFetcher((name) => storage.readRemote('main', name));

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
  // 以前放在根目录 / thumb/ / orig/ 的对象搬到 photos/ videos/ thumbs/ originals/
  await storage.migrateLayout().catch((e) => log.warn({ err: (e as Error).message }, 'object storage: sorting files into folders failed'));
  const sweep = async () => {
    const count = await storage.migrateLocal(NAMES);
    if (count) log.info({ count }, 'object storage: queued old local files (moved one at a time, new uploads go first)');
  };
  await sweep();
  setInterval(() => void sweep().then(() => storage.cleanupIncoming()).then(() => storage.migrateLayout()).catch(() => {}), 60 * 60_000).unref();
}

const IMAGE_LIMIT = 60 * 1024 * 1024;
const VIDEO_LIMIT = 2 * 1024 * 1024 * 1024;
const VIDEO_MAX = '2GB';
const IMAGE_MAX = '60MB';

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

class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type Log = { warn: (o: object, m: string) => void };

/** 文件已经在对象存储里有了：本地那份删掉，也不用再清理 / 上传 */
async function dropLocal(target: string, written: string[]) {
  const i = written.indexOf(target);
  if (i >= 0) written.splice(i, 1);
  await fs.rm(target, { force: true });
}

/**
 * 视频：读尺寸 / 时长、截封面、排队转码。target 已经在 written 里。
 * remote：直传到对象存储的原文件（incoming/...），原片和不用转码的视频直接在对象存储里复制，不再从服务器传一遍。
 */
async function processVideo(target: string, vext: string, fileName: string, keepOriginal: boolean, written: string[], log: Log, remote?: string): Promise<UploadedItem> {
  const name = path.basename(target);
  const { size } = await fs.stat(target);
  const item: UploadedItem = { kind: 'video', image: null, video: name, original: null, fileName, width: null, height: null, duration: null, size, takenAt: null };
  if (!(await ffmpegAvailable())) {
    if (remote && (await storage.copyObject(remote, 'main', name).then(() => true, () => false))) await dropLocal(target, written);
    return item;
  }
  const probe = await probeVideo(target);
  const plan = probe ? videoPlan(probe) : 'ok';
  if (probe) {
    Object.assign(item, displaySize(probe), { duration: probe.duration });
    // 要转码的视频，相册上传时先留一份原片供下载
    if (keepOriginal && plan !== 'ok') {
      const original = `${crypto.randomUUID()}.${vext}`;
      if (!remote || !(await storage.copyObject(remote, 'orig', original).then(() => true, () => false))) {
        await fs.link(target, path.join(ORIG_DIR, original)).catch(() => fs.copyFile(target, path.join(ORIG_DIR, original)));
        written.push(path.join(ORIG_DIR, original));
      }
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
  // 所有手机都能播的视频：对象存储里的原文件就是成品，复制过去就行
  if (remote && plan === 'ok' && (await storage.copyObject(remote, 'main', name).then(() => true, () => false))) {
    await markVideo(name, 'ok');
    await dropLocal(target, written);
    return item;
  }
  // 要转码的视频：转码要一阵子，先把原片放到对象存储里播放（不走服务器带宽），转好后成品覆盖它
  if (remote) await storage.copyObject(remote, 'main', name, { draft: true }).catch(() => {});
  enqueueVideo(name, log);
  return item;
}

/**
 * 直传到对象存储的视频：ffprobe / ffmpeg 直接读对象存储（只读文件头和第一帧附近），不把整个视频下载到服务器。
 * - 所有手机都能播：对象存储内部复制成成品，服务器完全不碰视频本身
 * - 要转码：先把原片放好供播放，转码排进后台队列（队列里再下载），上传马上就算完成
 * 读不了（比如 ffmpeg 不支持 https）返回 null，调用方按老办法整个下载下来处理。
 */
async function processRemoteVideo(remote: string, vext: string, fileName: string, size: number, keepOriginal: boolean, written: string[], log: Log): Promise<UploadedItem | null> {
  if (!(await ffmpegAvailable())) return null;
  const url = await storage.signedReadUrl(remote);
  const probe = await probeVideo(url);
  if (!probe) return null;
  const name = `${crypto.randomUUID()}.${vext}`;
  const plan = videoPlan(probe);
  const item: UploadedItem = { kind: 'video', image: null, video: name, original: null, fileName, ...displaySize(probe), duration: probe.duration, size, takenAt: null };
  try {
    const poster = `${crypto.randomUUID()}.jpg`;
    if (await makePoster(url, path.join(env.uploadDir, poster))) {
      written.push(path.join(env.uploadDir, poster));
      await sharp(path.join(env.uploadDir, poster)).resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(THUMB_DIR, poster));
      written.push(path.join(THUMB_DIR, poster));
      item.image = poster;
    }
    if (keepOriginal && plan !== 'ok') {
      const original = `${crypto.randomUUID()}.${vext}`;
      await storage.copyObject(remote, 'orig', original);
      item.original = original;
    }
    if (plan === 'ok') {
      await storage.copyObject(remote, 'main', name);
      await markVideo(name, 'ok');
    } else {
      await storage.copyObject(remote, 'main', name, { draft: true });
      await markVideo(name, 'fetch');
      enqueueVideo(name, log);
    }
    return item;
  } catch (e) {
    log.warn({ err: (e as Error).message, fileName }, 'direct video: processing in object storage failed, downloading instead');
    if (item.original) void storage.remove('orig', item.original).catch(() => {});
    return null;
  }
}

/** 图片：按 EXIF 摆正、限制最长边 2400px、生成 600px 缩略图，可选保留原图；安卓动态照片拆出视频 */
async function processImage(buf: Buffer, mimetype: string, fileName: string, keepOriginal: boolean, written: string[], log: Log, remote?: string): Promise<UploadedItem> {
  if (buf.length > IMAGE_LIMIT) throw new UploadError(413, `图片太大了（最大 ${IMAGE_MAX}）：${fileName}`);
  const isGif = mimetype === 'image/gif';
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
    log.warn({ err: e, mimetype, filename: fileName }, 'image processing failed');
    throw new UploadError(400, `无法识别的图片格式：${fileName}`);
  }

  let original: string | null = null;
  if (keepOriginal) {
    original = `${id}.${ORIG_EXT[meta.format ?? ''] ?? 'jpg'}`;
    if (!remote || !(await storage.copyObject(remote, 'orig', original).then(() => true, () => false))) {
      await fs.writeFile(path.join(ORIG_DIR, original), buf);
      written.push(path.join(ORIG_DIR, original));
    }
  }

  // 安卓动态照片：JPEG 后面接着一段 MP4
  let video: string | null = null;
  const embedded = meta.format === 'jpeg' ? findEmbeddedVideo(buf) : -1;
  if (embedded > 0) {
    video = `${id}.mp4`;
    await fs.writeFile(path.join(env.uploadDir, video), buf.subarray(embedded));
    written.push(path.join(env.uploadDir, video));
    // 三星等机型的动态照片是 HEVC，转成 iPhone 也能播的格式
    if (await ffmpegAvailable()) enqueueVideo(video, log);
  }

  const swap = (meta.orientation ?? 1) >= 5;
  return {
    kind: video ? 'live' : 'image',
    image: name,
    video,
    original,
    fileName,
    width: (swap ? meta.height : meta.width) ?? null,
    height: (swap ? meta.width : meta.height) ?? null,
    duration: null,
    size: buf.length,
    takenAt: exifTakenAt(meta.exif, env.tz)?.toISOString() ?? null,
  };
}

const DIRECT_ID_RE = /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
/** 浏览器算的文件指纹（大小 + 内容的 sha256） */
const HASH_RE = /^[a-z0-9:]{16,100}$/;
const directFile = z.object({ name: z.string().min(1).max(300), type: z.string().max(100).default(''), size: z.number().int().min(1), hash: z.string().regex(HASH_RE).optional() });

/**
 * 快速上传：同一个文件以前处理过，就在存储里把处理好的文件各复制一份（新文件名），不用重新上传。
 * 复制而不是共用，删掉其中一份不会影响另一份。原来的文件不在了、视频还没转完，就当没有，正常上传。
 */
async function instantCopy(hash: string, original: boolean, fileName: string): Promise<UploadedItem | null> {
  const where = and(eq(schema.uploadHashes.hash, hash), eq(schema.uploadHashes.original, original));
  const [row] = await db.select().from(schema.uploadHashes).where(where);
  if (!row) return null;
  const prev = row.item as UploadedItem;
  const sources: [string | null, 'main' | 'orig'][] = [
    [prev.image, 'main'],
    [prev.video, 'main'],
    [prev.original, 'orig'],
  ];
  for (const [name, kind] of sources) {
    if (name && !(await fileSource(name, kind))) {
      await db.delete(schema.uploadHashes).where(where);
      return null;
    }
  }
  if (prev.video && (await ffmpegAvailable()) && !videoSettled(prev.video)) return null;
  const image = prev.image ? await copyFile(prev.image) : null;
  const video = prev.video ? await copyFile(prev.video) : null;
  const status = prev.video ? videoStatus(prev.video) : undefined;
  if (video && status) await markVideo(video, status);
  let copiedOriginal: string | null = null;
  if (prev.original) {
    copiedOriginal = `${crypto.randomUUID()}${path.extname(prev.original)}`;
    await copyOne('orig', prev.original, copiedOriginal);
  }
  return { ...prev, image, video, original: copiedOriginal, fileName };
}

async function rememberHash(hash: string | undefined, original: boolean, item: UploadedItem) {
  if (!hash) return;
  await db
    .insert(schema.uploadHashes)
    .values({ hash, original, item: item as never })
    .onDuplicateKeyUpdate({ set: { item: item as never } })
    .catch(() => {});
}

/**
 * 上传：
 * - 图片自动按 EXIF 摆正、限制最长边 2400px、生成 600px 缩略图；?original=1 时额外保留原图（相册下载用）
 * - 视频原样保存（最大 2GB），支持断点续传式的 Range 播放
 * - 安卓「动态照片」会拆出里面的视频，变成 Live 图
 * 文件名是随机 UUID（不可猜测），通过 /files/<name>、/files/thumb/<name>、/files/orig/<name> 访问。
 * 配置了对象存储时，网页先把文件直传到对象存储（/api/files/direct → PUT → /api/files/complete），不经过服务器带宽。
 */
export async function fileRoutes(app: FastifyInstance) {
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(ORIG_DIR, { recursive: true });

  app.post('/api/files', { preHandler: app.authenticate }, async (req, reply) => {
    const keepOriginal = (req.query as { original?: string }).original === '1';
    const items: UploadedItem[] = [];
    const written: string[] = [];
    try {
      for await (const part of req.files({ limits: { fileSize: VIDEO_LIMIT, files: 30 } })) {
        const vext = videoExt(part.mimetype, part.filename);
        if (vext) {
          const target = path.join(env.uploadDir, `${crypto.randomUUID()}.${vext}`);
          written.push(target);
          await pipeline(part.file, createWriteStream(target));
          if (part.file.truncated) throw new UploadError(413, `视频太大了（最大 ${VIDEO_MAX}）：${part.filename}`);
          items.push(await processVideo(target, vext, part.filename, keepOriginal, written, req.log));
          continue;
        }
        items.push(await processImage(await part.toBuffer(), part.mimetype, part.filename, keepOriginal, written, req.log));
      }
    } catch (e) {
      // 中途失败：把已经写下的文件清掉，避免留下孤儿文件
      await Promise.all(written.map((f) => fs.rm(f, { force: true })));
      if (e instanceof UploadError) return reply.code(e.status).send({ message: e.message });
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ message: `文件太大了（视频最大 ${VIDEO_MAX}）` });
      throw e;
    }
    void offloadWritten(written);
    return { files: items.map((i) => (i.kind === 'video' ? i.video! : i.image!)), items };
  });

  // ---- 直传第一步：给每个文件一个 1 小时有效的上传链接（对象存储没配置 / 连不上时告诉前端走老路）
  app.post('/api/files/direct', { preHandler: app.authenticate }, async (req, reply) => {
    const body = z.object({ files: z.array(directFile).min(1).max(30), original: z.boolean().optional() }).parse(req.body);
    if (!storage.directUpload) return { enabled: false };
    for (const f of body.files) {
      const video = !!videoExt(f.type, f.name);
      if (f.size > (video ? VIDEO_LIMIT : IMAGE_LIMIT)) return reply.code(413).send({ message: `${video ? `视频太大了（最大 ${VIDEO_MAX}）` : `图片太大了（最大 ${IMAGE_MAX}）`}：${f.name}` });
    }
    const uploads = await Promise.all(
      body.files.map(async (f) => {
        // 同一个文件传过：直接复制一份，不用再传
        const instant = f.hash ? await instantCopy(f.hash, !!body.original, f.name).catch((e) => (req.log.warn(e, 'instant upload failed'), null)) : null;
        if (instant) return { instant };
        const ext = (f.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
        const id = `${crypto.randomUUID()}.${ext}`;
        const type = f.type || 'application/octet-stream';
        return { id, url: await storage.signedUploadUrl(id, type, f.size), headers: { 'Content-Type': type } };
      })
    );
    return { enabled: true, uploads };
  });

  // ---- 直传第二步：文件已经在对象存储里了，服务器取回来处理（和普通上传一样），返回同样的结果
  app.post('/api/files/complete', { preHandler: app.authenticate }, async (req, reply) => {
    const body = z
      .object({ uploads: z.array(z.object({ id: z.string().regex(DIRECT_ID_RE), name: z.string().min(1).max(300), hash: z.string().regex(HASH_RE).optional() })).min(1).max(30), original: z.boolean().optional() })
      .parse(req.body);
    if (!storage.enabled) return reply.code(400).send({ message: '对象存储没有配置' });
    const items: UploadedItem[] = [];
    const written: string[] = [];
    try {
      for (const u of body.uploads) {
        const head = await storage.headIncoming(u.id);
        if (!head) throw new UploadError(400, `上传没有完成，请重试：${u.name}`);
        const vext = videoExt(head.type, u.name);
        if (head.size > (vext ? VIDEO_LIMIT : IMAGE_LIMIT)) throw new UploadError(413, `${vext ? `视频太大了（最大 ${VIDEO_MAX}）` : `图片太大了（最大 ${IMAGE_MAX}）`}：${u.name}`);
        const remote = head.key;
        if (vext) {
          const direct = await processRemoteVideo(remote, vext, u.name, head.size, !!body.original, written, req.log).catch(() => null);
          if (direct) {
            items.push(direct);
            await rememberHash(u.hash, !!body.original, direct);
            continue;
          }
          const target = path.join(env.uploadDir, `${crypto.randomUUID()}.${vext}`);
          written.push(target);
          await pipeline(await storage.readIncoming(u.id), createWriteStream(target));
          items.push(await processVideo(target, vext, u.name, !!body.original, written, req.log, remote));
        } else {
          const chunks: Buffer[] = [];
          for await (const c of await storage.readIncoming(u.id)) chunks.push(c as Buffer);
          items.push(await processImage(Buffer.concat(chunks), head.type, u.name, !!body.original, written, req.log, remote));
        }
        await rememberHash(u.hash, !!body.original, items[items.length - 1]);
      }
    } catch (e) {
      await Promise.all(written.map((f) => fs.rm(f, { force: true })));
      if (e instanceof UploadError) return reply.code(e.status).send({ message: e.message });
      throw e;
    } finally {
      // 原文件已经处理（或复制）完了，临时对象删掉
      await Promise.all(body.uploads.map((u) => storage.removeIncoming(u.id)));
    }
    void offloadWritten(written);
    return { files: items.map((i) => (i.kind === 'video' ? i.video! : i.image!)), items };
  });

  const serve = (area: Area, re: RegExp) => async (req: { params: unknown; query: unknown }, reply: FastifyReply) => {
    const { name } = req.params as { name: string };
    if (!re.test(name)) return reply.code(404).send();
    const dir = storage.dir(area);
    const dl = (req.query as { dl?: string }).dl;
    const safe = dl ? dl.replace(/[\r\n"\\/]/g, '_').slice(0, 150) || name : undefined;
    const local = await fs.stat(path.join(dir, name)).catch(() => null);
    // 正在转码的视频：原片已经放在对象存储里了，从那里播（链接不缓存，转好后会换成成品）
    if (local && area === 'main' && VIDEO_RE.test(name) && !videoSettled(name) && storage.hasDraft(name)) {
      const { url } = await storage.signedUrl(area, name, { download: safe });
      reply.header('Cache-Control', 'no-store');
      return reply.redirect(url, 302);
    }
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

/** ffmpeg 能读的视频地址：本地文件，或对象存储的临时链接；都没有返回 null */
export async function videoInput(name: string | null | undefined): Promise<string | null> {
  if (!name || !FILE_NAME_RE.test(name)) return null;
  const local = storage.localPath('main', name);
  if (await fs.stat(local).catch(() => null)) return local;
  if (storage.enabled && (await storage.existsRemote('main', name))) return (await storage.signedUrl('main', name)).url;
  return null;
}

/** 把一张图片（比如从 Live 图里截的一帧）存成展示图 + 缩略图，和上传的照片一样 */
export async function storeStill(buf: Buffer): Promise<{ image: string; width: number | null; height: number | null; size: number }> {
  const image = `${crypto.randomUUID()}.jpg`;
  const main = path.join(env.uploadDir, image);
  const thumb = path.join(THUMB_DIR, image);
  const info = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(main);
  await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(thumb);
  void offloadWritten([main, thumb]);
  return { image, width: info.width ?? null, height: info.height ?? null, size: info.size ?? buf.length };
}

const VOICE_LIMIT = 3 * 1024 * 1024;
const VOICE_TYPES = /^audio\/(webm|ogg|mp4|x-m4a|m4a|aac|mpeg)|^video\/(webm|mp4)/;

/**
 * 聊天语音：iPhone 录出来是 mp4，安卓 Chrome 是 webm，统一转成 AAC 的 m4a，两边都能播。
 * 服务器没有 ffmpeg 时只接受本来就是 mp4 / m4a 的录音（原样保存）。
 */
export async function saveVoice(buf: Buffer, mimetype: string): Promise<{ voice: string; duration: number | null }> {
  if (!VOICE_TYPES.test(mimetype)) throw new UploadError(415, '不支持这种录音格式');
  const name = `${crypto.randomUUID()}.m4a`;
  const out = path.join(env.uploadDir, name);
  if (await ffmpegAvailable()) {
    const src = path.join(env.uploadDir, `${crypto.randomUUID()}.voice-src`);
    await fs.writeFile(src, buf);
    try {
      const r = await exec('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', out], 60_000);
      if (r.code !== 0) {
        await fs.rm(out, { force: true });
        throw new UploadError(400, '录音文件坏了，再录一次试试');
      }
    } finally {
      await fs.rm(src, { force: true });
    }
  } else if (/mp4|m4a|aac/.test(mimetype)) {
    await fs.writeFile(out, buf);
  } else {
    throw new UploadError(415, '服务器暂不支持这种录音格式');
  }
  let duration: number | null = null;
  if (await ffmpegAvailable()) {
    const p = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], 10_000);
    const d = Number.parseFloat(p.stdout.trim());
    if (Number.isFinite(d)) duration = Math.round(d * 10) / 10;
  }
  void offloadWritten([out]);
  return { voice: name, duration };
}

export async function voiceRoutes(app: FastifyInstance) {
  app.post('/api/chat/voice', { preHandler: app.authenticate }, async (req, reply) => {
    try {
      const part = await req.file({ limits: { fileSize: VOICE_LIMIT, files: 1 } });
      if (!part) return reply.code(400).send({ message: '没有收到录音' });
      const buf = await part.toBuffer();
      return await saveVoice(buf, part.mimetype);
    } catch (e) {
      if (e instanceof UploadError) return reply.code(e.status).send({ message: e.message });
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ message: '录音太长了' });
      throw e;
    }
  });
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
