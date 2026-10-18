import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from './env.ts';
import { sendDeployMail } from './mail.ts';

/**
 * 自动部署完成后，部署脚本在服务器本机调用这里发通知邮件。
 * 路径不在 /api/ 下，Nginx 不会转发到公网；另外还要用 JWT_SECRET 签名，防止别人乱触发。
 */
export const DEPLOY_NOTIFY_PATH = '/internal/deploy-notify';

export function deploySignature(secret: string, ts: string, commit: string) {
  return createHmac('sha256', secret).update(`deploy-notify.${ts}.${commit}`).digest('hex');
}

const release = z.object({
  version: z.string().max(40).nullable(),
  date: z.string().max(20),
  title: z.string().max(200),
  changes: z.array(z.object({ type: z.string().max(20), text: z.string().max(500) })).max(50),
});
const body = z.object({
  ts: z.string().regex(/^\d{10,16}$/),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/),
  version: z.string().max(40).nullable(),
  releases: z.array(release).max(50),
});

export function recipients(value: string) {
  if (/^(off|none|false|0)$/i.test(value.trim())) return [];
  return value
    .split(/[,，;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

export async function deployNotifyRoutes(app: FastifyInstance) {
  app.post(DEPLOY_NOTIFY_PATH, async (req, reply) => {
    const b = body.parse(req.body);
    const sig = String(req.headers['x-deploy-signature'] ?? '');
    const want = deploySignature(env.jwtSecret, b.ts, b.commit);
    const fresh = Math.abs(Date.now() - Number(b.ts)) < 10 * 60_000;
    if (!fresh || sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return reply.code(401).send({ message: 'bad signature' });
    const to = recipients(env.deployNotifyEmail);
    if (!to.length) return { sent: false, reason: 'disabled' };
    try {
      const sent = await sendDeployMail(to, { ...b, deployedAt: new Date(Number(b.ts)).toISOString() }, env.tz, (m) => req.log.info(m));
      return { sent, to };
    } catch (e) {
      req.log.warn(e, 'deploy notification mail failed');
      return reply.code(502).send({ sent: false, message: (e as Error).message });
    }
  });
}
