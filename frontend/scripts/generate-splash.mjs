/**
 * 生成 iPhone / iPad 主屏幕启动图（assets/pwa/splash-*.png）。
 * 启动图就是网页启动动画的第一帧，系统启动图切到动画时不会跳一下。
 * 修改 src/lib/launchScreen.ts 后：npm run build:web，然后 node scripts/generate-splash.mjs
 * 需要 Playwright（全局安装或 PLAYWRIGHT_MODULE 指定路径），只在本地生成图片时用，部署不需要。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/lib/launchScreen.ts'), 'utf8');
const list = source.slice(source.indexOf('export const SPLASH'), source.indexOf('];', source.indexOf('export const SPLASH')));
const sizes = [...list.matchAll(/\[(\d+), (\d+), (\d+)\]/g)].map((m) => m.slice(1).map(Number));
if (!sizes.length) throw new Error('没有找到启动图尺寸');

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright');
const { chromium } = require(modulePath);

// 只要 HTML 本身：不加载 App 的 JS，动画停在第一帧
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace(/<script src="\/_expo[^"]*"[^>]*><\/script>/g, '').replace('id="us-launch"', 'id="us-launch" class="still"'));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
try {
  for (const [w, h, r] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: r });
    await page.goto(url);
    await page.waitForTimeout(100);
    const file = path.join(root, `assets/pwa/splash-${w * r}x${h * r}.png`);
    await page.screenshot({ path: file });
    await page.close();
    console.log(path.relative(root, file));
  }
} finally {
  await browser.close();
  server.close();
}
