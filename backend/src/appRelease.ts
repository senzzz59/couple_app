import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { storage } from './files.ts';

/**
 * 安卓安装包信息：部署时 deploy/sync-android.mjs 把 APK 和 android.json 放到服务器的 downloads 目录（挂载进容器）。
 * - App 打开时来这里问最新安装包：runtime 和自己的不一样就提示下载新安装包
 * - 配了对象存储：后台把 APK 传上去，下载链接给对象存储的（比服务器带宽快很多）；还没传好就先给 /download/us.apk
 */
const DIR = path.resolve(process.env.APP_DOWNLOAD_DIR ?? '/app/downloads');

export type AndroidRelease = { version: string; build: string; file: string; size: number; sha256: string; runtime: string | null };

export async function readAndroidRelease(dir = DIR): Promise<AndroidRelease | null> {
  const raw = await fs.readFile(path.join(dir, 'android.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (!raw || typeof raw !== 'object') return null;
  const { version, build, file, size, sha256, runtime } = raw as Record<string, unknown>;
  if (typeof version !== 'string' || typeof build !== 'string' || typeof file !== 'string' || !/^us-[\w.-]+\.apk$/.test(file)) return null;
  if (typeof size !== 'number' || !(size > 0) || typeof sha256 !== 'string') return null;
  return { version, build, file, size, sha256, runtime: typeof runtime === 'string' && runtime ? runtime : null };
}

/** 已经传到对象存储的安装包：文件名 → key */
const mirrored = new Map<string, string>();
let mirroring: Promise<void> | null = null;

function mirror(release: AndroidRelease, log: FastifyBaseLogger) {
  if (!storage.enabled || mirrored.has(release.file) || mirroring) return;
  mirroring = storage
    .putAppFile(path.join(DIR, release.file), release.file, release.size)
    .then((key) => {
      mirrored.clear();
      mirrored.set(release.file, key);
      log.info({ file: release.file }, 'android apk mirrored to object storage');
    })
    .catch((e) => log.warn({ file: release.file, err: (e as Error).message }, 'android apk mirror failed'))
    .finally(() => (mirroring = null));
}

export async function appReleaseRoutes(app: FastifyInstance) {
  // 部署换了新安装包后尽快传上去，不用等第一个人来问
  const tick = () => void readAndroidRelease().then((r) => r && mirror(r, app.log));
  tick();
  setInterval(tick, 5 * 60_000).unref();

  // 不用登录：安装包本来就能从 /download/us.apk 直接下载
  app.get('/api/app/android', async (_req, reply) => {
    const release = await readAndroidRelease();
    if (!release) return reply.code(404).send({ error: '安装包还没准备好' });
    mirror(release, app.log);
    const key = mirrored.get(release.file);
    const url = key ? await storage.signedAppUrl(key, 'us.apk').catch(() => null) : null;
    reply.header('Cache-Control', 'no-store');
    return { version: release.version, build: release.build, runtime: release.runtime, size: release.size, sha256: release.sha256, url: url ?? '/download/us.apk' };
  });
}
