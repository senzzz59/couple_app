import { planCleanup, type References } from './cleanupPlan.ts';
import { db, schema } from './db/index.ts';
import { FILE_NAME_RE, ORIG_RE, storage } from './files.ts';
import { mediaFiles } from './media.ts';

/**
 * 清理没人引用的文件（本地和对象存储一起）：
 * 比如发动态时传了照片最后没发、删除时对象存储刚好连不上……时间长了会越积越多。
 * 只删 3 天前的文件，一次要删的太多就停下来报警，不冒险。
 */

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

/** 数据库里所有引用到的文件名（新增存文件名的字段时记得加到这里） */
export async function collectReferences(): Promise<References> {
  const s = schema;
  const files = new Set<string>();
  const originals = new Set<string>();
  const add = (n: unknown) => typeof n === 'string' && n && files.add(n);
  for (const u of await db.select({ avatar: s.users.avatar }).from(s.users)) add(u.avatar);
  for (const p of await db.select({ cover: s.places.cover }).from(s.places)) add(p.cover);
  for (const v of await db.select({ photos: s.visits.photos }).from(s.visits)) (v.photos ?? []).forEach(add);
  for (const m of await db.select({ photos: s.moments.photos, media: s.moments.media }).from(s.moments)) {
    (m.photos ?? []).forEach(add);
    mediaFiles(m.media).forEach(add);
  }
  for (const c of await db.select({ image: s.comments.image, sticker: s.comments.sticker }).from(s.comments)) {
    add(c.image);
    add(c.sticker);
  }
  for (const st of await db.select({ file: s.stickers.file }).from(s.stickers)) add(st.file);
  for (const c of await db.select({ photos: s.capsules.photos }).from(s.capsules)) (c.photos ?? []).forEach(add);
  for (const g of await db.select({ image: s.galleryItems.image, video: s.galleryItems.video, original: s.galleryItems.original }).from(s.galleryItems)) {
    add(g.image);
    add(g.video);
    if (g.original) originals.add(g.original);
  }
  return { files, originals };
}

export async function cleanupOrphans(log: Log) {
  const refs = await collectReferences();
  const stored = await storage.listStored();
  const { remove, total, suspicious } = planCleanup(stored, refs, (area, name) => (area === 'orig' ? ORIG_RE : FILE_NAME_RE).test(name));
  if (suspicious) {
    log.warn({ wouldRemove: remove.length, total, referenced: refs.files.size }, 'unused file cleanup skipped: too many files look unused');
    return { removed: 0, skipped: remove.length };
  }
  for (const f of remove) await storage.remove(f.area, f.name);
  if (remove.length) log.info({ removed: remove.length, total }, 'removed unused files');
  return { removed: remove.length, skipped: 0 };
}

/** 启动 30 分钟后清理一次，之后每天一次 */
export function scheduleOrphanCleanup(log: Log) {
  const run = () => void cleanupOrphans(log).catch((e) => log.warn({ err: (e as Error).message }, 'unused file cleanup failed'));
  setTimeout(() => {
    run();
    setInterval(run, 24 * 3600_000).unref();
  }, 30 * 60_000).unref();
}
