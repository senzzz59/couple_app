import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import fs from 'node:fs/promises';
import { ZodError } from 'zod';

import { authRoutes, decorateAuth } from './auth.ts';
import { foodCategoryRoutes } from './foodCategories.ts';
import { amapRoutes } from './amapRoutes.ts';
import { capsuleRoutes } from './capsules.ts';
import { runMigrations } from './db/index.ts';
import { env } from './env.ts';
import { fileRoutes, initStorage, storage } from './files.ts';
import { ffmpegAvailable, initVideoPipeline } from './transcode.ts';
import { galleryRoutes } from './gallery.ts';
import { scheduleOrphanCleanup } from './orphans.ts';
import { settingsRoutes } from './settings.ts';
import { realtimeRoutes } from './realtime.ts';
import { registerRoutes } from './register.ts';
import { resourceRoutes } from './resources.ts';
import { pushRoutes } from './push.ts';
import { webPushRoutes } from './webPush.ts';

await fs.mkdir(env.uploadDir, { recursive: true });
await runMigrations();

const app = Fastify({ logger: { level: 'info' }, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });

// 允许 Content-Type 为 JSON 但 body 为空（DELETE / 点赞这类请求）
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch (e) {
    (e as { statusCode?: number }).statusCode = 400;
    done(e as Error, undefined);
  }
});

await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
await app.register(jwt, { secret: env.jwtSecret });
await app.register(multipart);
await app.register(fastifyStatic, { root: env.uploadDir, serve: false });
await app.register(websocket);

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) {
    // 自定义的中文提示直接给用户看，其它的统一说「参数不对」
    const custom = err.issues.map((i) => i.message).find((m) => /[一-龥]/.test(m));
    return reply.code(400).send({ message: custom ?? '参数不对', issues: err.issues });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ message: status >= 500 ? '服务器出错了' : (err as Error).message });
});

decorateAuth(app);
app.get('/api/health', async () => ({ ok: true, video: (await ffmpegAvailable()) ? 'ffmpeg' : 'passthrough', storage: storage.enabled ? 'oss' : 'local' }));
await app.register(authRoutes);
await app.register(registerRoutes);
await app.register(realtimeRoutes);
await app.register(fileRoutes);
await app.register(resourceRoutes);
await app.register(amapRoutes);
await app.register(foodCategoryRoutes);
await app.register(capsuleRoutes);
await app.register(galleryRoutes);
await app.register(pushRoutes);
await app.register(webPushRoutes);
await app.register(settingsRoutes);

await app.listen({ port: env.port, host: env.host });
// 启动后再检查以前上传的视频，不耽误 API 上线
// 视频检查先启动，对象存储的搬运会跳过还没处理完的视频
void initVideoPipeline(env.uploadDir, app.log).then(() => initStorage(app.log)).catch((e) => app.log.warn(e, 'object storage init failed'));
// 每天清理一次没人引用的照片 / 视频（本地和对象存储）
scheduleOrphanCleanup(app.log);
