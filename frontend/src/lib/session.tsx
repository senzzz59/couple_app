import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api, clearToken, loadCredentials, saveCredentials, setUnauthorizedHandler, wsUrl } from './api';
import { clearCache, invalidate, useQuery } from './store';
import { cancelReminders } from './notify';
import { registerPush, unregisterPush } from './push';
import type { Space, User } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';
export type NudgeEvent = { id?: string; kind: string; from: string; at: string; remotePush?: boolean };

interface SessionValue {
  status: Status;
  signIn: (url: string, email: string, password: string) => Promise<void>;
  /** 注册 / 重置密码成功后直接用返回的 token 登录 */
  signInWithToken: (url: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  onNudge: (fn: (e: NudgeEvent) => void) => () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const nudgeListeners = useRef(new Set<(e: NudgeEvent) => void>());

  useEffect(() => {
    loadCredentials().then(({ token }) => setStatus(token ? 'signedIn' : 'signedOut'));
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await cancelReminders().catch(() => {});
    await clearToken();
    clearCache();
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
  }, [signOut]);

  const signInWithToken = useCallback(async (url: string, token: string) => {
    await saveCredentials(url, token);
    clearCache();
    setStatus('signedIn');
  }, []);

  const signIn = useCallback(
    async (url: string, email: string, password: string) => {
      const res = await api.login(url, email.trim(), password);
      await signInWithToken(url, res.token);
    },
    [signInWithToken]
  );

  // ---- 实时通道：断线自动重连，回到前台时刷新
  useEffect(() => {
    if (status !== 'signedIn') return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        retry = 0;
        ws?.send(JSON.stringify({ type: 'presence', active: AppState.currentState === 'active' }));
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data));
          if (e.type === 'change') invalidate(e.collection === 'users' ? 'me' : e.collection);
          if (e.type === 'nudge') nudgeListeners.current.forEach((fn) => fn(e));
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    connect();
    registerPush().catch(() => {});

    const sub = AppState.addEventListener('change', (s) => {
      if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'presence', active: s === 'active' }));
      if (s !== 'active') return;
      registerPush().catch(() => {});
      for (const c of ['me', 'space', 'places', 'visits', 'anniversaries', 'moments', 'todos', 'answers', 'capsules', 'gallery', 'albums', 'stickers']) invalidate(c);
      if (ws && ws.readyState > 1) {
        clearTimeout(timer);
        connect();
      }
    });
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      sub.remove();
    };
  }, [status]);

  const onNudge = useCallback((fn: (e: NudgeEvent) => void) => {
    nudgeListeners.current.add(fn);
    return () => void nudgeListeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({ status, signIn, signInWithToken, signOut, onNudge }), [status, signIn, signInWithToken, signOut, onNudge]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside provider');
  return v;
}

/** 自己、另一半、空间设置 */
export function useCouple() {
  const me = useQuery<{ me: User; partner: User | null }>('/api/me');
  const space = useQuery<Space>('/api/space');
  return {
    me: me.data?.me,
    partner: me.data?.partner ?? null,
    space: space.data,
    userName: (id: string | null | undefined) =>
      id && id === me.data?.me.id ? me.data.me.name : id && id === me.data?.partner?.id ? me.data.partner.name : '',
    userById: (id: string | null | undefined) =>
      id === me.data?.me.id ? me.data?.me : id === me.data?.partner?.id ? me.data?.partner : undefined,
  };
}
