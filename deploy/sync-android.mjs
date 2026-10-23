import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 安卓 APK 下载：deploy/android-release.json 记录 EAS 打好的 APK 地址和 sha256（自动打包时填写；手动记录时可以省略，只靠 HTTPS）。
 * 部署时下载到 <root>/downloads（不随网页版本切换），网页里的 /download/us.apk 指向当前版本。
 * EAS 内部分发的下载地址过一段时间会失效，所以下载一次后就一直保存在服务器上。
 */
export async function syncAndroidApk({ root, release, fetchImpl = fetch, log = console.log }) {
  if (!release) return { updated: false, reason: 'no release' };
  const { version, build, url, sha256 } = release;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !/^[0-9a-f-]{8,}$/i.test(build ?? '') || !/^https:\/\//.test(url ?? '') || (sha256 != null && !/^[0-9a-f]{64}$/i.test(sha256))) {
    throw new Error('Invalid android-release.json');
  }
  const downloads = path.join(root, 'downloads');
  await fs.mkdir(downloads, { recursive: true });
  const file = `us-${version}-${build.slice(0, 8)}.apk`;
  const target = path.join(downloads, file);
  const hashOf = async (p) => createHash('sha256').update(await fs.readFile(p)).digest('hex');
  let updated = false;
  const expected = sha256?.toLowerCase();
  if ((await fs.stat(target).catch(() => null)) && (!expected || (await hashOf(target)) === expected)) {
    log(`Android APK already present: ${file}`);
  } else {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`APK download failed: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (expected && createHash('sha256').update(data).digest('hex') !== expected) throw new Error('APK sha256 mismatch');
    const temporary = `${target}.download-${process.pid}`;
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, target);
    updated = true;
    log(`Android APK downloaded: ${file}`);
  }
  // us.apk 原子切换到当前版本
  const link = path.join(downloads, 'us.apk');
  const nextLink = `${link}.next-${process.pid}`;
  await fs.symlink(file, nextLink);
  await fs.rename(nextLink, link);
  const { size } = await fs.stat(target);
  await fs.writeFile(path.join(downloads, 'android.json'), JSON.stringify({ version, build, file, size, sha256: await hashOf(target), updatedAt: new Date().toISOString() }, null, 2));
  // 只保留当前和上一个 APK
  const apks = (await fs.readdir(downloads)).filter((name) => /^us-.*\.apk$/.test(name) && name !== file);
  const dated = await Promise.all(apks.map(async (name) => ({ name, time: (await fs.stat(path.join(downloads, name))).mtimeMs })));
  for (const { name } of dated.sort((a, b) => b.time - a.time).slice(1)) await fs.unlink(path.join(downloads, name));
  return { updated, file };
}
