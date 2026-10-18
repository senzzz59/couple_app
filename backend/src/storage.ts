import {
  CopyObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
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
import { createHash } from 'node:crypto';
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
type Job = { area: Area; name: string; background: boolean };
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

/**
 * 设置跨域这类必须带校验的请求，新版 SDK 用 x-amz-checksum-crc32，雨云等服务会报
 * 「A header you provided implies functionality that is not implemented」；换回老式的 Content-MD5。
 */
export function useContentMd5(c: S3Client) {
  c.middlewareStack.addRelativeTo(
    ((next: (a: unknown) => Promise<unknown>) => async (args: { request: { headers: Record<string, string>; body?: unknown } }) => {
      const { headers, body } = args.request;
      const names = Object.keys(headers).filter((h) => /^x-amz-(sdk-)?checksum-/i.test(h));
      if (names.length && (typeof body === 'string' || body instanceof Uint8Array)) {
        for (const h of names) delete headers[h];
        headers['content-md5'] = createHash('md5').update(body).digest('base64');
      }
      return next(args);
    }) as never,
    { name: 'contentMd5Fallback', relation: 'before', toMiddleware: 'httpSigningMiddleware', override: true } as never
  );
  return c;
}

function client(cfg: S3Config, endpoint: string, forcePathStyle: boolean) {
  return useContentMd5(new S3Client({
    endpoint,
    region: cfg.region,
    forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // 新版 SDK 默认附带 CRC32 校验头，很多 S3 兼容服务不认；只在必须时才加
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}

export class Storage {
  readonly cfg: S3Config | null;
  private readonly dirs: Record<Area, string>;
  /** 生成给浏览器的链接：公网地址 */
  private readonly signer: S3Client | null;
  /** 服务器自己读写：有内网地址且连得通时走内网 */
  private ops: S3Client | null;
  private log: Log = { info: () => {}, warn: () => {} };
  /** 新上传的文件：优先传，传完就从对象存储加载 */
  private readonly urgent: Job[] = [];
  /** 以前存在本地的文件：后台慢慢搬，最多占一个通道，不和新上传抢带宽 */
  private readonly backlog: Job[] = [];
  private readonly queued = new Set<string>();
  private active = 0;
  private activeBacklog = 0;
  private readonly concurrency = 3;
  private migrated = 0;
  /** 启动检查通过 */
  private ready = false;
  /** 桶允许浏览器 PUT（直传要用）；null 表示不确定 */
  private corsPut: boolean | null = null;
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
      this.ready = true;
    } catch (e) {
      log.warn({ endpoint: cfg.endpoint, bucket: cfg.bucket, err: (e as Error).message }, 'object storage check failed: files stay on local disk until it works');
      return;
    }
    // 浏览器要能读（手机保存到相册）、能 PUT（网页直传）
    let rules: { AllowedMethods?: string[] }[] | null = null;
    try {
      rules = (await this.ops!.send(new GetBucketCorsCommand({ Bucket: cfg.bucket }))).CORSRules ?? [];
    } catch (e) {
      const code = (e as { name?: string }).name;
      if (code === 'NoSuchCORSConfiguration' || code === 'NoSuchCorsConfiguration') rules = [];
    }
    if (rules && rules.some((r) => r.AllowedMethods?.includes('PUT') && r.AllowedMethods.includes('GET'))) {
      this.corsPut = true;
    } else if (rules) {
      await this.ops!
        .send(
          new PutBucketCorsCommand({
            Bucket: cfg.bucket,
            CORSConfiguration: { CORSRules: [{ AllowedMethods: ['GET', 'HEAD', 'PUT'], AllowedOrigins: ['*'], AllowedHeaders: ['*'], ExposeHeaders: ['Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges', 'ETag'], MaxAgeSeconds: 86400 }] },
          })
        )
        .then(() => {
          this.corsPut = true;
          log.info({}, 'object storage: enabled CORS for GET/PUT (saving photos, direct uploads)');
        })
        .catch((err: Error) => {
          this.corsPut = false;
          log.warn({ err: err.message }, 'object storage: could not set CORS (uploads go through the server; saving to phone falls back to download)');
        });
    }
  }

  /** 本地文件处理完成，排队传到对象存储；background 是搬运旧文件 */
  offload(area: Area, name: string, background = false) {
    if (!this.cfg) return;
    const id = `${area}/${name}`;
    if (this.queued.has(id)) {
      // 已经在后台队列里排着：提到前面
      const i = background ? -1 : this.backlog.findIndex((j) => j.area === area && j.name === name);
      if (i >= 0) this.urgent.push(...this.backlog.splice(i, 1).map((j) => ({ ...j, background: false })));
    } else {
      this.queued.add(id);
      (background ? this.backlog : this.urgent).push({ area, name, background });
    }
    this.pump();
  }

  /** 还没搬完的数量（新上传 + 旧文件） */
  get pending() {
    return this.urgent.length + this.backlog.length + this.active;
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
        if (!this.queued.has(`${area}/${f}`)) count++;
        this.offload(area, f, true);
      }
    }
    return count;
  }

  private next(): Job | undefined {
    if (this.urgent.length) return this.urgent.shift();
    if (this.backlog.length && this.activeBacklog < 1) return this.backlog.shift();
    return undefined;
  }

  private pump() {
    let job: Job | undefined;
    while (this.active < this.concurrency && (job = this.next())) {
      const { area, name, background } = job;
      this.active++;
      if (background) this.activeBacklog++;
      void this.upload(area, name)
        .then(() => {
          if (!background) return;
          this.migrated++;
          if (this.migrated % 100 === 0) this.log.info({ done: this.migrated, left: this.backlog.length }, 'object storage: moving old files');
          if (!this.backlog.length) this.log.info({ done: this.migrated }, 'object storage: old files moved');
        })
        .catch((e) => this.log.warn({ area, name, err: (e as Error).message }, 'object storage upload failed; file kept on local disk'))
        .finally(() => {
          this.active--;
          if (background) this.activeBacklog--;
          this.queued.delete(`${area}/${name}`);
          this.removed.delete(`${area}/${name}`);
          this.pump();
          if (!this.pending) for (const w of this.idleWaiters.splice(0)) w();
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

  /** 网页可以直接把文件传到对象存储 */
  get directUpload() {
    return this.ready && this.corsPut !== false;
  }

  incomingKey(id: string) {
    return `${this.cfg?.prefix ?? ''}incoming/${id}`;
  }

  /** 直传链接：只能 PUT 这一个文件，类型和大小都写进签名，1 小时有效 */
  async signedUploadUrl(id: string, contentType: string, size: number) {
    const cmd = new PutObjectCommand({ Bucket: this.cfg!.bucket, Key: this.incomingKey(id), ContentType: contentType, ContentLength: size });
    return getSignedUrl(this.signer!, cmd, { expiresIn: 3600 });
  }

  async headIncoming(id: string) {
    try {
      const h = await this.ops!.send(new HeadObjectCommand({ Bucket: this.cfg!.bucket, Key: this.incomingKey(id) }));
      return { size: Number(h.ContentLength ?? 0), type: h.ContentType ?? '' };
    } catch {
      return null;
    }
  }

  async readIncoming(id: string): Promise<Readable> {
    const res = await this.ops!.send(new GetObjectCommand({ Bucket: this.cfg!.bucket, Key: this.incomingKey(id) }));
    return res.Body as Readable;
  }

  async removeIncoming(id: string) {
    await this.ops!.send(new DeleteObjectCommand({ Bucket: this.cfg!.bucket, Key: this.incomingKey(id) })).catch(() => {});
  }

  /** 对象存储内部复制（不经过服务器带宽），设置好成品的类型和缓存头 */
  async copyObject(sourceKey: string, area: Area, name: string) {
    const cfg = this.cfg!;
    await this.ops!.send(
      new CopyObjectCommand({
        Bucket: cfg.bucket,
        Key: this.key(area, name),
        CopySource: `${cfg.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        MetadataDirective: 'REPLACE',
        ContentType: this.contentType(area, name),
        CacheControl: 'private, max-age=31536000, immutable',
      })
    );
  }

  /** 传了一半就放弃的直传文件：一天后清掉 */
  async cleanupIncoming() {
    if (!this.cfg || !this.ready) return;
    let token: string | undefined;
    do {
      const page = await this.ops!.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: this.incomingKey(''), ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (o.Key && o.LastModified && Date.now() - o.LastModified.getTime() > 24 * 3600_000) {
          await this.ops!.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: o.Key })).catch(() => {});
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  /** 列出存着的所有文件（本地 + 对象存储），清理没人引用的文件用；不认识的对象（incoming/ 等）不列 */
  async listStored(): Promise<{ area: Area; name: string; modifiedAt: number }[]> {
    const out: { area: Area; name: string; modifiedAt: number }[] = [];
    for (const area of ['main', 'thumb', 'orig'] as Area[]) {
      for (const f of await fs.readdir(this.dirs[area]).catch(() => [] as string[])) {
        const st = await fs.stat(path.join(this.dirs[area], f)).catch(() => null);
        if (st?.isFile()) out.push({ area, name: f, modifiedAt: st.mtimeMs });
      }
    }
    if (!this.cfg || !this.ready) return out;
    const prefix = this.cfg.prefix;
    let token: string | undefined;
    do {
      const page = await this.ops!.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: prefix || undefined, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        const rest = o.Key?.slice(prefix.length) ?? '';
        const [first, second, extra] = rest.split('/');
        const where: [Area, string] | null =
          second === undefined ? ['main', first] : extra === undefined && first === 'thumb' ? ['thumb', second] : extra === undefined && first === 'orig' ? ['orig', second] : null;
        if (where && where[1]) out.push({ area: where[0], name: where[1], modifiedAt: o.LastModified?.getTime() ?? Date.now() });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** 等上传队列清空（测试 / 停机前用） */
  idle() {
    if (!this.pending) return Promise.resolve();
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
