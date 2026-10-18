import type { StoredUpload } from './uploadStore';

export type { StoredUpload } from './uploadStore';

/**
 * 网页版的上传队列存在浏览器的 IndexedDB 里（连同文件）：
 * 切到别的应用、页面被系统暂停甚至关掉，下次打开会接着传。存不下（空间不够、隐私模式）就只在内存里排队。
 */
const DB = 'us-uploads';
const STORE = 'queue';

let opening: Promise<IDBDatabase | null> | null = null;

function openVersion(version?: number) {
  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = version ? indexedDB.open(DB, version) : indexedDB.open(DB);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // 另一个标签页要升级数据库：先让开，下次用到时再重新打开
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function open() {
  opening ??= (async () => {
    const db = await openVersion();
    if (!db || db.objectStoreNames.contains(STORE)) return db;
    // 数据库在、表却没有（比如第一次建库时被打断）：升一个版本把表补上
    const next = db.version + 1;
    db.close();
    return openVersion(next);
  })();
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function saveUpload(rec: StoredUpload) {
  await run('readwrite', (s) => s.put(rec));
}

export async function deleteUpload(id: string) {
  await run('readwrite', (s) => s.delete(id));
}

export async function loadUploads(): Promise<StoredUpload[]> {
  return ((await run('readonly', (s) => s.getAll())) as StoredUpload[] | undefined) ?? [];
}
