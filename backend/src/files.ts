import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { env } from './env.ts';

const THUMB_DIR = path.join(env.uploadDir, 'thumb');
const NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

/**
 * 照片上传：自动按 EXIF 摆正、限制最长边 2400px、生成 600px 缩略图。
 * 文件名是随机 UUID（不可猜测），通过 /files/<name> 与 /files/thumb/<name> 访问。
 */
export async function fileRoutes(app: FastifyInstance) {
  await fs.mkdir(THUMB_DIR, { recursive: true });

  app.post('/api/files', { preHandler: app.authenticate }, async (req, reply) => {
    const names: string[] = [];
    for await (const part of req.files({ limits: { fileSize: 25 * 1024 * 1024, files: 20 } })) {
      const buf = await part.toBuffer();
      const isGif = part.mimetype === 'image/gif';
      const name = `${crypto.randomUUID()}.${isGif ? 'gif' : 'jpg'}`;
      try {
        if (isGif) {
          await fs.writeFile(path.join(env.uploadDir, name), buf);
        } else {
          const img = sharp(buf, { failOn: 'none' }).rotate();
          await img.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(env.uploadDir, name));
        }
        await sharp(buf, { failOn: 'none', animated: false }).rotate().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(THUMB_DIR, name));
      } catch (e) {
        req.log.warn(e, 'image processing failed');
        return reply.code(400).send({ message: `无法识别的图片格式：${part.filename}` });
      }
      names.push(name);
    }
    return { files: names };
  });

  for (const [prefix, dir] of [['/files/thumb/', THUMB_DIR], ['/files/', env.uploadDir]] as const) {
    app.get(`${prefix}:name`, async (req, reply) => {
      const { name } = req.params as { name: string };
      if (!NAME_RE.test(name)) return reply.code(404).send();
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.sendFile(name, dir);
    });
  }
}

export async function removeFiles(names: (string | null | undefined)[]) {
  for (const n of names) {
    if (!n || !NAME_RE.test(n)) continue;
    await fs.rm(path.join(env.uploadDir, n), { force: true });
    await fs.rm(path.join(THUMB_DIR, n), { force: true });
  }
}
