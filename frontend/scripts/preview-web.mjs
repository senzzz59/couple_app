import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.WEB_PREVIEW_PORT || 8098);
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.css': 'text/css' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (pathname.startsWith('/api/') || pathname.startsWith('/files/')) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message: '这是网页预览，正式部署后由宝塔连接后端' }));
    return;
  }
  const requested = path.resolve(root, `.${pathname}`);
  if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const candidates = [requested, `${requested}.html`, path.join(requested, 'index.html')];
  const target = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) ?? (path.extname(pathname) ? null : path.join(root, 'index.html'));
  if (!target) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
  fs.createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`网页预览：http://127.0.0.1:${port}`));
