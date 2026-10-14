import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function validateWebhook(headers, body, secret) {
  const supplied = headers['x-gitee-token'] || body.password;
  if (typeof supplied !== 'string' || typeof secret !== 'string' || secret.length < 32) return { status: 401, message: 'unauthorized' };
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { status: 401, message: 'unauthorized' };
  const event = headers['x-gitee-event'] || headers['x-git-oschina-event'] || body.hook_name;
  const repository = body.repository?.full_name || body.repository?.path_with_namespace;
  if (!['Push Hook', 'push_hooks'].includes(event) || repository !== 'sensnow/couple_web' || body.ref !== 'refs/heads/master' || body.deleted === true || !/^[0-9a-f]{40}$/i.test(body.after ?? '') || /^0+$/.test(body.after)) {
    return { status: 200, message: 'ignored' };
  }
  return { status: 202, message: 'frontend and backend deployment queued' };
}

export function createWebhookServer({ secret, deploy }) {
  let running = false;
  let pending = false;
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (pending) {
        pending = false;
        try { await deploy(); }
        catch (error) { console.error('Deployment failed:', error.message); }
      }
    } finally { running = false; }
  };
  return http.createServer(async (req, res) => {
    const send = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ message })); };
    if (req.method !== 'POST' || req.url !== '/webhooks/gitee') return send(404, 'not found');
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return send(413, 'payload too large');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, 'invalid payload');
      const result = validateWebhook(req.headers, body, secret);
      send(result.status, result.message);
      if (result.status === 202) { pending = true; void drain(); }
    } catch { if (!res.headersSent) send(400, 'invalid payload'); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || secret.length < 32) throw new Error('WEBHOOK_SECRET must contain at least 32 characters');
  const script = fileURLToPath(new URL('./deploy-all.mjs', import.meta.url));
  const deploy = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`deploy exited ${code}`)));
  });
  createWebhookServer({ secret, deploy }).listen(Number(process.env.WEBHOOK_PORT || 8790), '127.0.0.1', () => console.log('Gitee deployment webhook listening on 127.0.0.1:8790'));
}
