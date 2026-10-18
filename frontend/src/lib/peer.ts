import { useSyncExternalStore } from 'react';

import { onRealtime, sendRealtime } from './realtime';

/**
 * 相册里的「两个人一起看」：
 * - peer：另一半此刻在哪（在线、在相册网格、在看哪张）。服务器推过来，不存库。
 * - 我在哪：页面「占用」一个位置，最上面（最后打开）的那个算数；关掉页面就还回去。
 * - 一起看：邀请 → 对方加入 → 谁翻页就发 goto，对方跟着翻。
 */
export type Where = 'grid' | 'viewer' | null;
export type PeerState = { online: boolean; where: Where; itemId: string | null };
export type CoviewState = { status: 'idle' | 'inviting' | 'active'; itemId: string | null };
export type Reaction = { from: string; itemId: string; emoji?: string; text?: string; at: string };

type Snapshot = { peer: PeerState; coview: CoviewState };

const OFFLINE: PeerState = { online: false, where: null, itemId: null };
let snap: Snapshot = { peer: OFFLINE, coview: { status: 'idle', itemId: null } };
const subs = new Set<() => void>();
const set = (next: Partial<Snapshot>) => {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export const usePeer = () => useSyncExternalStore(subscribe, () => snap.peer, () => snap.peer);
export const useCoview = () => useSyncExternalStore(subscribe, () => snap.coview, () => snap.coview);
export const peerNow = () => snap.peer;
export const coviewNow = () => snap.coview;

// ---------------- 我在哪
type Claim = { where: Where; itemId: string | null };
const claims: Claim[] = [];
let sent: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function flush(force = false) {
  clearTimeout(timer);
  const top = claims.at(-1) ?? { where: null, itemId: null };
  const key = `${top.where}|${top.itemId}`;
  if (!force && key === sent) return;
  if (sendRealtime({ type: 'look', where: top.where, itemId: top.itemId })) sent = key;
}
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
};

/** 页面打开时占一个位置；返回的 update 改看哪张，release 在页面关掉时调用 */
export function claimLook(where: Where, itemId: string | null = null) {
  const c: Claim = { where, itemId };
  claims.push(c);
  schedule();
  return {
    update(next: string | null) {
      if (c.itemId === next) return;
      c.itemId = next;
      schedule();
    },
    release() {
      const i = claims.indexOf(c);
      if (i >= 0) claims.splice(i, 1);
      schedule();
    },
  };
}

// ---------------- 一起看
let inviteTimer: ReturnType<typeof setTimeout> | undefined;

export function inviteCoview(itemId: string) {
  if (!sendRealtime({ type: 'coview', action: 'invite', itemId })) return false;
  clearTimeout(inviteTimer);
  set({ coview: { status: 'inviting', itemId } });
  // 一分钟没人理就算了
  inviteTimer = setTimeout(() => snap.coview.status === 'inviting' && set({ coview: { status: 'idle', itemId: null } }), 60_000);
  return true;
}

export function joinCoview(itemId: string) {
  if (!sendRealtime({ type: 'coview', action: 'join', itemId })) return false;
  set({ coview: { status: 'active', itemId } });
  return true;
}

export function leaveCoview() {
  clearTimeout(inviteTimer);
  if (snap.coview.status !== 'idle') sendRealtime({ type: 'coview', action: 'leave' });
  set({ coview: { status: 'idle', itemId: null } });
}

/** 一起看时我翻到了这张 */
export function coviewGoto(itemId: string) {
  if (snap.coview.status !== 'active') return;
  set({ coview: { status: 'active', itemId } });
  sendRealtime({ type: 'coview', action: 'goto', itemId });
}

export function sendReaction(itemId: string, r: { emoji: string } | { text: string }) {
  return sendRealtime({ type: 'react', itemId, ...r });
}

/** 一起看里对方的动作：加入 / 退出 / 翻页（邀请由全局提示处理） */
type CoviewEvent = { from: string; action: 'invite' | 'join' | 'leave' | 'goto'; itemId?: string };
const coviewListeners = new Set<(e: CoviewEvent) => void>();
export function onCoview(fn: (e: CoviewEvent) => void) {
  coviewListeners.add(fn);
  return () => void coviewListeners.delete(fn);
}

onRealtime<PeerState>('peer', (e) => {
  const peer = { online: !!e.online, where: e.where ?? null, itemId: e.itemId ?? null };
  set({ peer });
  // 对方关掉了查看器 / 离开了：一起看结束
  if (snap.coview.status === 'active' && (!peer.online || peer.where !== 'viewer')) {
    set({ coview: { status: 'idle', itemId: null } });
    coviewListeners.forEach((f) => f({ from: '', action: 'leave' }));
  }
});

onRealtime<CoviewEvent>('coview', (e) => {
  if (e.action === 'join' && snap.coview.status === 'inviting') {
    clearTimeout(inviteTimer);
    set({ coview: { status: 'active', itemId: snap.coview.itemId } });
  } else if (e.action === 'leave') {
    if (snap.coview.status === 'idle') return;
    clearTimeout(inviteTimer);
    set({ coview: { status: 'idle', itemId: null } });
  } else if (e.action === 'goto') {
    if (snap.coview.status !== 'active' || !e.itemId) return;
    set({ coview: { status: 'active', itemId: e.itemId } });
  }
  coviewListeners.forEach((f) => f(e));
});

// 重连后把自己的位置再报一次；断开时对方状态未知，当作不在
onRealtime('open', () => flush(true));
onRealtime('close', () => {
  sent = null;
  set({ peer: OFFLINE });
  if (snap.coview.status !== 'idle') set({ coview: { status: 'idle', itemId: null } });
});

// ---------------- 查看器是否开着（开着时回应由查看器自己显示）
let viewerOpen = 0;
export const setViewerOpen = (open: boolean) => {
  viewerOpen += open ? 1 : -1;
};
export const isViewerOpen = () => viewerOpen > 0;
