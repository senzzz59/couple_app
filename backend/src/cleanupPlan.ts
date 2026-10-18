import type { Area } from './storage.ts';

/** 只删 3 天前的文件：正在编辑、还没保存的不会误删 */
export const GRACE_MS = 3 * 24 * 3600_000;

export type References = { files: Set<string>; originals: Set<string> };
export type Stored = { area: Area; name: string; modifiedAt: number };

/** 哪些文件可以删：名字是我们生成的、没人引用、并且超过 3 天没动过 */
export function planCleanup(stored: Stored[], refs: References, isOurs: (area: Area, name: string) => boolean, now = Date.now()) {
  // 同一个文件可能本地和对象存储各有一份：按最新的那份算
  const newest = new Map<string, Stored>();
  for (const f of stored) {
    const id = `${f.area}/${f.name}`;
    const prev = newest.get(id);
    if (!prev || f.modifiedAt > prev.modifiedAt) newest.set(id, f);
  }
  const remove: { area: Area; name: string }[] = [];
  for (const f of newest.values()) {
    if (!isOurs(f.area, f.name) || now - f.modifiedAt < GRACE_MS) continue;
    const used = f.area === 'orig' ? refs.originals.has(f.name) : refs.files.has(f.name);
    if (!used) remove.push({ area: f.area, name: f.name });
  }
  const total = newest.size;
  // 一次要删一半以上：多半是哪里出了问题（比如数据库读错了），宁可不删
  const suspicious = remove.length > 20 && remove.length > total / 2;
  return { remove, total, suspicious };
}
