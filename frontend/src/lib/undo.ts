import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { dismissToast, toast } from '@/components/motion';

import { haptic } from './haptics';

/**
 * 可撤销的删除：先从界面上拿掉，顶部提示条里给一个「撤销」按钮；
 * 几秒内没撤销，才真正请求服务器删除。离开页面 / 切到后台时立即提交，避免丢操作。
 */
type Pending = { commit: () => void };
const pending = new Set<Pending>();

// 等待删除的条目 id：列表在这期间被刷新（比如对方改了别的东西）也不会把它又显示出来
let hiddenIds: ReadonlySet<string> = new Set();
const hiddenListeners = new Set<() => void>();
function setHidden(id: string, on: boolean) {
  const next = new Set(hiddenIds);
  if (on) next.add(id);
  else next.delete(id);
  hiddenIds = next;
  hiddenListeners.forEach((l) => l());
}
/** 正在等待删除（还可以撤销）的 id */
export function usePendingDeletes() {
  return useSyncExternalStore(
    (cb) => {
      hiddenListeners.add(cb);
      return () => void hiddenListeners.delete(cb);
    },
    () => hiddenIds
  );
}

function flushAll() {
  [...pending].forEach((p) => p.commit());
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (s) => s !== 'active' && flushAll());
  if (Platform.OS === 'web' && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', flushAll);
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (globalThis.document?.visibilityState === 'hidden') flushAll();
    });
  }
}

export function undoable({
  id,
  message,
  emoji = '🗑️',
  apply,
  revert,
  commit,
  delay = 4500,
}: {
  /** 被删除条目的 id，用于在等待期间把它藏起来 */
  id?: string;
  message: string;
  emoji?: string;
  /** 立即执行：从界面上拿掉 */
  apply: () => void;
  /** 撤销或者服务器删除失败时：放回去 */
  revert: () => void;
  /** 真正删除 */
  commit: () => Promise<unknown>;
  delay?: number;
}) {
  listen();
  haptic.warn();
  apply();
  if (id) setHidden(id, true);
  let done = false;
  const entry: Pending = {
    commit: () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pending.delete(entry);
      commit()
        .catch((e: Error) => {
          revert();
          toast('删除失败，已经放回去了', '⚠️', e.message);
        })
        .finally(() => id && setHidden(id, false));
    },
  };
  const timer = setTimeout(entry.commit, delay);
  pending.add(entry);
  const toastId = toast(message, emoji, undefined, {
    duration: delay,
    action: {
      label: '撤销',
      onPress: () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pending.delete(entry);
        if (id) setHidden(id, false);
        revert();
      },
    },
  });
  return () => dismissToast(toastId);
}
