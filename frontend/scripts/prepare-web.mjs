import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
// 版本号：主.次 来自 app.json，第三位是提交数，每次发布自动递增；拿不到 git 信息时退回 app.json 的版本
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const [major = '1', minor = '0'] = String(expo.version).split('.');
const commits = git(['rev-list', '--count', 'HEAD']);
const commit = git(['rev-parse', '--short=7', 'HEAD']);
const version = /^\d+$/.test(commits) ? `${major}.${minor}.${commits}` : expo.version;
const metadata = { id, version, commit: commit || null, builtAt: new Date().toISOString(), assets };
fs.mkdirSync(path.join(output, 'icons'), { recursive: true });
fs.writeFileSync(path.join(output, 'icons/icon.png'), icon);
// 主屏幕图标、启动画面（assets/pwa 里预先生成好的各种尺寸）
const pwaDir = path.join(root, 'assets/pwa');
const pwaFiles = fs.readdirSync(pwaDir).filter((f) => f.endsWith('.png'));
for (const f of pwaFiles) fs.copyFileSync(path.join(pwaDir, f), path.join(output, 'icons', f));
// 安卓 Chrome 需要 192 和 512 的图标（以及可裁成圆形的 maskable 图标）才会把网页安装成真正的应用：
// 桌面图标不带 Chrome 角标、出现在应用列表里、全屏打开
fs.writeFileSync(path.join(output, 'manifest.webmanifest'), JSON.stringify({
  id: '/',
  name: 'us.',
  short_name: 'us.',
  description: '只属于我们两个人。',
  lang: 'zh-CN',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone'],
  orientation: 'portrait',
  theme_color: '#FAF7F5',
  background_color: '#FAF7F5',
  categories: ['lifestyle', 'social'],
  prefer_related_applications: false,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // 长按桌面图标出现的快捷入口
  shortcuts: [
    { name: '发动态', short_name: '发动态', url: '/moment/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    { name: '相册', short_name: '相册', url: '/gallery', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    { name: '今天吃什么', short_name: '吃什么', url: '/roulette', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
  ],
}, null, 2));
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(metadata));
fs.writeFileSync(path.join(output, 'web-build.js'), `window.__US_BUILD__=${JSON.stringify(metadata)};\n`);
fs.writeFileSync(path.join(output, 'offline.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#FAF7F5"><title>us. · 等网络回来</title><style>body{margin:0;background:#FAF7F5;color:#4B2E35;font-family:system-ui;min-height:100vh;display:grid;place-items:center}main{max-width:320px;padding:28px;text-align:center}button{background:#E5627F;color:white;border:0;border-radius:20px;padding:14px 28px;font-size:16px}</style></head><body><main><h1>等网络回来</h1><p>暂时连不上网络。你们的记录保存在服务器，联网后就能继续查看。</p><button onclick="location.reload()">重新连接</button></main><script>window.addEventListener('online',()=>setTimeout(()=>location.reload(),500))</script></body></html>`);
const precache = ['/offline.html', '/icons/icon.png', '/icons/icon-192.png', '/icons/icon-512.png', ...assets];
fs.writeFileSync(path.join(output, 'sw.js'), `/* us. ${id} */
const CACHE = 'us-static-${id}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE))));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('us-static-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
// 后台通知：TA 发动态、评论、戳一戳。iOS 要求每条推送都显示出来
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'us.';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
  }));
});
// 点通知：已经开着就切过去并跳到对应页面，没开就打开
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      // App 里自己跳页面，不用整页刷新
      client.postMessage({ type: 'open', url: event.notification.data?.url || '/' });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => await caches.match('/offline.html') || new Response('暂时离线，请联网后刷新', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
    return;
  }
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
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
console.log(`网页版已生成：v${version}${commit ? ` (${commit})` : ''} / ${id}，包含主屏幕图标、更新检查和离线提示。`);
