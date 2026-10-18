import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { syncDeployTools } from './sync-tools.mjs';

export function validateWebhook(headers, rawBody, secret) {
  const supplied = headers['x-hub-signature-256'];
  if (typeof supplied !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(supplied) || typeof secret !== 'string' || secret.length < 32 || !Buffer.isBuffer(rawBody)) return { status: 401, message: 'unauthorized' };
  // GitHub signs the original bytes, including JSON whitespace and UTF-8 content.
  const actual = Buffer.from(supplied.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (!timingSafeEqual(actual, expected)) return { status: 401, message: 'unauthorized' };
  let body;
  try { body = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400, message: 'invalid payload' }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, message: 'invalid payload' };
  const event = headers['x-github-event'];
  if (body.repository?.full_name !== 'senzzz59/couple_app') return { status: 200, message: 'ignored' };
  if (event === 'ping') return { status: 200, message: 'pong' };
  if (event !== 'push' || body.ref !== 'refs/heads/master' || body.deleted === true || !/^[0-9a-f]{40}$/i.test(body.after ?? '') || /^0+$/.test(body.after)) {
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
    // Keep the old URL usable while existing Nginx configurations are updated.
    // Both paths require GitHub's signature; Gitee tokens are no longer accepted.
    if (req.method !== 'POST' || !['/webhooks/github', '/webhooks/gitee'].includes(req.url)) return send(404, 'not found');
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return send(413, 'payload too large');
        chunks.push(chunk);
      }
      const result = validateWebhook(req.headers, Buffer.concat(chunks), secret);
      send(result.status, result.message);
      if (result.status === 202) { pending = true; void drain(); }
    } catch { if (!res.headersSent) send(400, 'invalid payload'); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || secret.length < 32) throw new Error('WEBHOOK_SECRET must contain at least 32 characters');
  const script = fileURLToPath(new URL('./deploy-all.mjs', import.meta.url));
  const repository = path.resolve(path.dirname(script), '..');
  const deploy = async () => {
    // 先把部署脚本更新到最新（安全时才快进），再用新脚本部署
    await syncDeployTools(repository);
    return runDeploy();
  };
  const runDeploy = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`deploy exited ${code}`)));
  });
  createWebhookServer({ secret, deploy }).listen(Number(process.env.WEBHOOK_PORT || 8790), '127.0.0.1', () => console.log('GitHub deployment webhook listening on 127.0.0.1:8790'));
}
