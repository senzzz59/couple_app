/**
 * 更新时「原样保留」：刷新页面装新版本前，把正在填的内容（文字、选项、刚选的照片）和页面层级存起来，
 * 刷新后放回去。用户在哪个页面、填到哪里，更新完还是那样。
 *
 * - 页面层级（JSON）放 sessionStorage：同一个窗口刷新后还在，关掉就没了
 * - 填写的内容可能带照片 / 视频文件，放 IndexedDB（能存文件）
 * 只在「立即更新」时保存，平时不存任何东西。
 */
const FLAG = 'us.update.keep';
const DB = 'us-keep';
const STORE = 'snapshot';
/** 刷新太久才回来（比如更新卡住后用户自己重开）就不再恢复 */
const MAX_AGE = 10 * 60_000;
/** 恢复出来的内容只在刷新后的这一小段时间里有效，之后新打开的表单是空的 */
const RESTORE_WINDOW = 20_000;

type Snapshot = { at: number; nav: unknown; from: string | null };

const getters = new Map<string, () => unknown>();
let restored = new Map<string, unknown>();

/** 表单登记一个需要保留的值；返回取消登记的函数 */
export function keepValue(key: string, get: () => unknown) {
  getters.set(key, get);
  return () => {
    if (getters.get(key) === get) getters.delete(key);
  };
}

/**
 * 刷新前保留下来的值（没有就是 undefined）。每次取都重新生成预览链接：
 * 恢复页面层级时同一个页面可能先后挂载两次，前一次卸载会收回它拿到的链接。
 */
export function keptValue<T>(key: string): T | undefined {
  return restored.has(key) ? (unpack(restored.get(key)) as T) : undefined;
}

// ---------------- IndexedDB（一个库一张表，只存一条）
function openDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  try {
    return await new Promise<T | undefined>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        let result: T | undefined;
        req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  } finally {
    db.close();
  }
}

// ---------------- 打包 / 还原：blob: 链接刷新后会失效，换成文件本身存起来
/** 本地预览链接和它对应的文件字段（选好的照片 / 视频） */
const SIBLING: Record<string, string> = { uri: 'file', videoUri: 'videoFile', posterUri: 'posterFile' };
type Packed = { __blob: Blob } | { __sibling: string };

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

async function pack(v: unknown): Promise<unknown> {
  if (typeof v === 'string' && v.startsWith('blob:')) {
    const blob = await fetch(v).then((r) => r.blob()).catch(() => null);
    return blob ? ({ __blob: blob } satisfies Packed) : null;
  }
  if (Array.isArray(v)) return Promise.all(v.map(pack));
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(v)) {
      if (typeof item === 'function') continue;
      const sib = SIBLING[k];
      // 同一个文件已经在旁边的字段里了，不用再存一份
      if (sib && typeof item === 'string' && item.startsWith('blob:') && v[sib] instanceof Blob) out[k] = { __sibling: sib } satisfies Packed;
      else out[k] = await pack(item);
    }
    return out;
  }
  return typeof v === 'function' ? undefined : v;
}

function unpack(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unpack);
  if (isPlain(v)) {
    if (v.__blob instanceof Blob) return URL.createObjectURL(v.__blob);
    const out: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(v)) {
      const sib = isPlain(item) && typeof item.__sibling === 'string' ? item.__sibling : null;
      out[k] = sib ? (v[sib] instanceof Blob ? URL.createObjectURL(v[sib] as Blob) : null) : unpack(item);
    }
    return out;
  }
  return v;
}

// ---------------- 页面层级：只留下名字、参数和子页面，刷新后按新版本重新生成
type NavLike = { index?: number; routes?: { name: string; params?: object; state?: NavLike }[] };
function slimNav(state: NavLike | undefined): NavLike | undefined {
  if (!state?.routes?.length) return undefined;
  return {
    index: state.index,
    routes: state.routes.map((r) => ({ name: r.name, ...(r.params ? { params: r.params } : {}), ...(r.state ? { state: slimNav(r.state) } : {}) })),
  };
}

/** 「立即更新」：刷新前保存页面层级和正在填的内容 */
export async function saveForUpdate(nav: unknown, from: string | null) {
  const snapshot: Snapshot = { at: Date.now(), nav: slimNav(nav as NavLike), from };
  try {
    sessionStorage.setItem(FLAG, JSON.stringify(snapshot));
  } catch {
    return;
  }
  const drafts: Record<string, unknown> = {};
  for (const [key, get] of getters) {
    try {
      drafts[key] = await pack(get());
    } catch {}
  }
  await idb('readwrite', (s) => s.put({ at: snapshot.at, drafts }, 'update'));
}

/** 是不是刚刚因为更新刷新过（同步判断，决定要不要等恢复完再显示页面） */
export function hasKept() {
  try {
    return !!sessionStorage.getItem(FLAG);
  } catch {
    return false;
  }
}

/** 刷新后：取回页面层级和填写的内容（只能取一次） */
export async function restoreAfterUpdate(): Promise<{ nav: unknown; from: string | null } | null> {
  let snapshot: Snapshot | null = null;
  try {
    snapshot = JSON.parse(sessionStorage.getItem(FLAG) ?? 'null');
    sessionStorage.removeItem(FLAG);
  } catch {}
  if (!snapshot) return null;
  const saved = await idb<{ at: number; drafts: Record<string, unknown> }>('readonly', (s) => s.get('update'));
  void idb('readwrite', (s) => s.delete('update'));
  if (Date.now() - snapshot.at > MAX_AGE) return null;
  if (saved?.at === snapshot.at) {
    restored = new Map(Object.entries(saved.drafts));
    setTimeout(() => (restored = new Map()), RESTORE_WINDOW);
  }
  return { nav: snapshot.nav, from: snapshot.from };
}
