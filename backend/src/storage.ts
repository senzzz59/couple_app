import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * 对象存储（雨云 ROS 等 S3 兼容服务）：
 * - 上传仍先落到服务器本地（要压缩图片、截封面、转码视频），处理完后台传到对象存储，校验大小后删掉本地文件
 * - 访问 /files/... 时本地还有就直接给，没有就 302 跳转到对象存储的临时签名链接（桶保持私有）
 * - 启动时把以前存在本地的照片 / 视频逐个搬过去
 * 没配置对象存储时一切照旧，只用本地目录。
 */

export type Area = 'main' | 'thumb' | 'orig';
type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

export type S3Config = {
  endpoint: string;
  internalEndpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
};

const clean = (v: string | undefined) => (v ?? '').trim();
const withScheme = (url: string, scheme: 'https' | 'http') => (!url || /^https?:\/\//i.test(url) ? url : `${scheme}://${url}`).replace(/\/+$/, '');

export function s3ConfigFrom(e: NodeJS.ProcessEnv): S3Config | null {
  const cfg: S3Config = {
    endpoint: withScheme(clean(e.S3_ENDPOINT), 'https'),
    // 内网地址只给服务器自己上传 / 删除用；浏览器拿到的链接永远是公网地址
    internalEndpoint: withScheme(clean(e.S3_INTERNAL_ENDPOINT), 'http'),
    bucket: clean(e.S3_BUCKET),
    region: clean(e.S3_REGION) || 'us-east-1',
    accessKeyId: clean(e.S3_ACCESS_KEY),
    secretAccessKey: clean(e.S3_SECRET_KEY),
    forcePathStyle: clean(e.S3_FORCE_PATH_STYLE) === 'true',
    prefix: '',
  };
  const prefix = clean(e.S3_PREFIX).replace(/^\/+|\/+$/g, '');
  if (prefix) cfg.prefix = `${prefix}/`;
  if (!cfg.endpoint || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey) return null;
  return cfg;
}

const SUBDIR: Record<Area, string> = { main: '', thumb: 'thumb/', orig: 'orig/' };

export const objectKey = (prefix: string, area: Area, name: string) => `${prefix}${SUBDIR[area]}${name}`;

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  dng: 'image/x-adobe-dng',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
};

/** 存到对象存储时的 Content-Type；转码过的视频内容是 MP4（扩展名不变） */
export function contentTypeOf(name: string, isMp4 = false) {
  const ext = name.split('.').pop()!.toLowerCase();
  if (isMp4 && /^(mp4|mov|m4v|webm|3gp)$/.test(ext)) return 'video/mp4';
  return TYPES[ext] ?? 'application/octet-stream';
}

/**
 * 签名链接按固定的时间窗生成：同一个窗口里同一个文件的链接不变，浏览器 / App 的图片缓存才能命中。
 * 每个链接有效 7 天（S3 签名的上限），窗口 3 天，所以拿到的链接至少还能用 4 天。
 */
export const SIGN_WINDOW_S = 3 * 24 * 3600;
export const SIGN_EXPIRES_S = 7 * 24 * 3600;
export function signWindow(nowMs: number) {
  const start = Math.floor(nowMs / 1000 / SIGN_WINDOW_S) * SIGN_WINDOW_S;
  return { signingDate: new Date(start * 1000), cacheSeconds: Math.max(60, start + SIGN_WINDOW_S - Math.floor(nowMs / 1000)) };
}

function client(cfg: S3Config, endpoint: string, forcePathStyle: boolean) {
  return new S3Client({
    endpoint,
    region: cfg.region,
    forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // 新版 SDK 默认附带 CRC32 校验头，很多 S3 兼容服务不认；只在必须时才加
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class Storage {
  readonly cfg: S3Config | null;
  private readonly dirs: Record<Area, string>;
  /** 生成给浏览器的链接：公网地址 */
  private readonly signer: S3Client | null;
  /** 服务器自己读写：有内网地址且连得通时走内网 */
  private ops: S3Client | null;
  private log: Log = { info: () => {}, warn: () => {} };
  private readonly queue: { area: Area; name: string; contentType?: string }[] = [];
  private readonly queued = new Set<string>();
  private active = 0;
  private readonly concurrency = 3;
  /** 上传途中被删掉的文件：传完后把对象也删掉，不留孤儿 */
  private readonly removed = new Set<string>();
  private idleWaiters: (() => void)[] = [];
  /** 判断主目录里的视频是否已经处理完（转码中的不能搬走） */
  videoReady: (name: string) => boolean | Promise<boolean> = () => true;
  contentType: (area: Area, name: string) => string = (_area, name) => contentTypeOf(name);

  constructor(uploadDir: string, cfg: S3Config | null) {
    this.cfg = cfg;
    this.dirs = { main: uploadDir, thumb: path.join(uploadDir, 'thumb'), orig: path.join(uploadDir, 'orig') };
    this.signer = cfg ? client(cfg, cfg.endpoint, cfg.forcePathStyle) : null;
    this.ops = this.signer;
  }

  get enabled() {
    return !!this.cfg;
  }

  dir(area: Area) {
    return this.dirs[area];
  }

  localPath(area: Area, name: string) {
    return path.join(this.dirs[area], name);
  }

  key(area: Area, name: string) {
    return objectKey(this.cfg?.prefix ?? '', area, name);
  }

  /** 浏览器可以直接打开的临时链接；dl 时带上下载文件名 */
  async signedUrl(area: Area, name: string, opts: { download?: string; now?: number } = {}) {
    if (!this.cfg || !this.signer) throw new Error('object storage is not configured');
    const { signingDate, cacheSeconds } = signWindow(opts.now ?? Date.now());
    const cmd = new GetObjectCommand({
      Bucket: this.cfg.bucket,
      Key: this.key(area, name),
      ResponseContentDisposition: opts.download
        ? `attachment; filename="${encodeURIComponent(opts.download)}"; filename*=UTF-8''${encodeURIComponent(opts.download)}`
        : undefined,
    });
    const url = await getSignedUrl(this.signer, cmd, { expiresIn: SIGN_EXPIRES_S, signingDate });
    return { url, cacheSeconds };
  }

  /** 启动检查：连通性、内网地址、浏览器跨域读取（手机「保存到相册」要 fetch 文件） */
  async init(log: Log) {
    this.log = log;
    if (!this.cfg || !this.signer) return;
    const cfg = this.cfg;
    if (cfg.internalEndpoint) {
      // 内网地址按控制台的写法是「内网地址/桶名」，用路径风格
      const internal = client(cfg, cfg.internalEndpoint, true);
      try {
        await internal.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
        this.ops = internal;
        log.info({ endpoint: cfg.internalEndpoint }, 'object storage: using internal endpoint for uploads');
      } catch (e) {
        log.warn({ endpoint: cfg.internalEndpoint, err: (e as Error).message }, 'object storage: internal endpoint unreachable, using public endpoint');
      }
    }
    try {
      await this.ops!.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
      log.info({ endpoint: cfg.endpoint, bucket: cfg.bucket }, 'object storage connected');
    } catch (e) {
      log.warn({ endpoint: cfg.endpoint, bucket: cfg.bucket, err: (e as Error).message }, 'object storage check failed: files stay on local disk until it works');
      return;
    }
    try {
      await this.ops!.send(new GetBucketCorsCommand({ Bucket: cfg.bucket }));
    } catch (e) {
      const code = (e as { name?: string }).name;
      if (code === 'NoSuchCORSConfiguration' || code === 'NoSuchCorsConfiguration') {
        await this.ops!
          .send(
            new PutBucketCorsCommand({
              Bucket: cfg.bucket,
              CORSConfiguration: { CORSRules: [{ AllowedMethods: ['GET', 'HEAD'], AllowedOrigins: ['*'], AllowedHeaders: ['*'], ExposeHeaders: ['Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges'], MaxAgeSeconds: 86400 }] },
            })
          )
          .then(() => log.info({}, 'object storage: enabled CORS for GET so browsers can save photos'))
          .catch((err: Error) => log.warn({ err: err.message }, 'object storage: could not set CORS (saving to phone falls back to download)'));
      }
    }
  }

  /** 本地文件处理完成，排队传到对象存储 */
  offload(area: Area, name: string) {
    if (!this.cfg) return;
    const id = `${area}/${name}`;
    if (this.queued.has(id)) return;
    this.queued.add(id);
    this.queue.push({ area, name });
    this.pump();
  }

  /** 搬运本地已有的文件（启动时、以及之后定时补漏） */
  async migrateLocal(names: Record<Area, RegExp>) {
    if (!this.cfg) return 0;
    let count = 0;
    for (const area of ['thumb', 'main', 'orig'] as Area[]) {
      const files = await fs.readdir(this.dirs[area]).catch(() => [] as string[]);
      for (const f of files) {
        if (!names[area].test(f)) continue;
        if (area === 'main' && /\.(mp4|mov|webm|m4v|3gp)$/.test(f) && !(await this.videoReady(f))) continue;
        // 刚写的文件可能还没写完 / 还在处理，交给上传流程自己搬
        const st = await fs.stat(path.join(this.dirs[area], f)).catch(() => null);
        if (!st || Date.now() - st.mtimeMs < 10 * 60_000) continue;
        this.offload(area, f);
        count++;
      }
    }
    return count;
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void this.upload(job.area, job.name)
        .catch((e) => this.log.warn({ area: job.area, name: job.name, err: (e as Error).message }, 'object storage upload failed; file kept on local disk'))
        .finally(() => {
          this.active--;
          this.queued.delete(`${job.area}/${job.name}`);
          this.removed.delete(`${job.area}/${job.name}`);
          this.pump();
          if (!this.active && !this.queue.length) for (const w of this.idleWaiters.splice(0)) w();
        });
    }
  }

  private async upload(area: Area, name: string) {
    const file = this.localPath(area, name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return;
    const key = this.key(area, name);
    const cfg = this.cfg!;
    await new Upload({
      client: this.ops!,
      params: {
        Bucket: cfg.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentType: this.contentType(area, name),
        ContentLength: stat.size,
        // 文件名随机、内容不变：允许浏览器长期缓存
        CacheControl: 'private, max-age=31536000, immutable',
      },
      queueSize: 2,
      partSize: 16 * 1024 * 1024,
    }).done();
    const head = await this.ops!.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    if (Number(head.ContentLength) !== stat.size) throw new Error(`size mismatch after upload (${head.ContentLength} != ${stat.size})`);
    if (this.removed.has(`${area}/${name}`)) {
      await this.ops!.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })).catch(() => {});
      return;
    }
    // 上传期间文件被改过（比如视频重新转码）就留着，下次再传
    const after = await fs.stat(file).catch(() => null);
    if (!after || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) return;
    await fs.rm(file, { force: true });
  }

  /** 等上传队列清空（测试 / 停机前用） */
  idle() {
    if (!this.active && !this.queue.length) return Promise.resolve();
    return new Promise<void>((r) => this.idleWaiters.push(r));
  }

  async existsRemote(area: Area, name: string) {
    if (!this.cfg) return false;
    try {
      await this.ops!.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(area, name) }));
      return true;
    } catch {
      return false;
    }
  }

  async readRemote(area: Area, name: string): Promise<Readable> {
    const res = await this.ops!.send(new GetObjectCommand({ Bucket: this.cfg!.bucket, Key: this.key(area, name) }));
    return res.Body as Readable;
  }

  async copyRemote(area: Area, from: string, to: string) {
    const cfg = this.cfg!;
    await this.ops!.send(new CopyObjectCommand({ Bucket: cfg.bucket, Key: this.key(area, to), CopySource: `${cfg.bucket}/${this.key(area, from).split('/').map(encodeURIComponent).join('/')}` }));
  }

  /** 删除本地和对象存储里的文件 */
  async remove(area: Area, name: string) {
    await fs.rm(this.localPath(area, name), { force: true });
    if (!this.cfg) return;
    const id = `${area}/${name}`;
    if (this.queued.has(id)) this.removed.add(id);
    await this.ops!.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(area, name) })).catch((e) =>
      this.log.warn({ area, name, err: (e as Error).message }, 'object storage delete failed')
    );
  }
}
