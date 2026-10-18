import { useSyncExternalStore } from 'react';

/**
 * 「发现新版本」弹窗的开关，以及刷新后待恢复的页面层级。
 * 弹窗挂在根布局（components/UpdateCenter.tsx），任何地方都能打开：顶部提示、设置、关于。
 */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openUpdateSheet() {
  open = true;
  emit();
}
export function closeUpdateSheet() {
  open = false;
  emit();
}
export function useUpdateSheetOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => open,
    () => open,
  );
}

/** 更新刷新前保存的页面层级（启动时取出，进入 App 后放回去） */
export type PendingRestore = { nav: unknown; from: string | null };
let pending: PendingRestore | null = null;
export function setPendingRestore(r: PendingRestore | null) {
  pending = r;
}
export function takePendingRestore() {
  const r = pending;
  pending = null;
  return r;
}
