import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const jsDirectory = path.join(output, '_expo/static/js/web');
const assets = fs.readdirSync(jsDirectory).filter((file) => file.endsWith('.js')).sort().map((file) => `/_expo/static/js/web/${file}`);
if (!assets.length) throw new Error('网页导出缺少 JavaScript 文件');
const hash = createHash('sha256');
for (const file of [...assets, '/index.html']) hash.update(fs.readFileSync(path.join(output, file)));
const icon = fs.readFileSync(path.join(root, 'assets/images/icon.png'));
hash.update(icon);
const id = hash.digest('hex').slice(0, 16);
const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const metadata = { id, version: expo.version, assets };
fs.mkdirSync(path.join(output, 'icons'), { recursive: true });
fs.writeFileSync(path.join(output, 'icons/icon.png'), icon);
fs.writeFileSync(path.join(output, 'manifest.webmanifest'), JSON.stringify({
  id: '/', name: 'us. — 只属于我们两个人', short_name: 'us.', lang: 'zh-CN', description: '记录一起吃过的店、重要的日子和日常的小瞬间。',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait', theme_color: '#FFF7F5', background_color: '#FFF7F5',
  icons: [{ src: '/icons/icon.png', sizes: `${icon.readUInt32BE(16)}x${icon.readUInt32BE(20)}`, type: 'image/png', purpose: 'any' }],
}, null, 2));
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(metadata));
fs.writeFileSync(path.join(output, 'web-build.js'), `window.__US_BUILD__=${JSON.stringify(metadata)};\n`);
fs.writeFileSync(path.join(output, 'offline.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#FFF7F5"><title>us. · 等网络回来</title><style>body{margin:0;background:#FFF7F5;color:#4B2E35;font-family:system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:320px;padding:28px;text-align:center}button{background:#E5627F;color:white;border:0;border-radius:20px;padding:14px 28px;font-size:16px}</style></head><body><main><h1>等网络回来</h1><p>暂时连不上网络。你们的记录保存在服务器，联网后就能继续查看。</p><button onclick="location.reload()">重新连接</button></main><script>window.addEventListener('online',()=>setTimeout(()=>location.reload(),500))</script></body></html>`);
const precache = ['/offline.html', '/icons/icon.png', ...assets];
fs.writeFileSync(path.join(output, 'sw.js'), `/* us. ${id} */
const CACHE = 'us-static-${id}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE))));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('us-static-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => await caches.match('/offline.html') || new Response('暂时离线，请联网后刷新', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
    return;
  }
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || url.pathname === '/icons/icon.png') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const stored = await cache.match(request);
      if (stored) return stored;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
`);
console.log(`网页版已生成：v${expo.version} / ${id}，包含主屏幕图标、更新检查和离线提示。`);
