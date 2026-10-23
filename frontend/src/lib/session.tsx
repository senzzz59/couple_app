import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { api, clearToken, loadCredentials, saveCredentials, setNotPairedHandler, setUnauthorizedHandler, wsUrl } from './api';
import { emitRealtime, onRealtime, setRealtimeSender } from './realtime';
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
    // 在别的设备上解除了关系：重新读一下自己，回到配对页
    setNotPairedHandler(() => void invalidate('me'));
    return () => setNotPairedHandler(null);
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
      const socket = new WebSocket(wsUrl());
      ws = socket;
      socket.onopen = () => {
        retry = 0;
        socket.send(JSON.stringify({ type: 'presence', active: AppState.currentState === 'active' }));
        emitRealtime({ type: 'open' });
      };
      socket.onmessage = (m) => {
        let e;
        try {
          e = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (!e || typeof e.type !== 'string') return;
        if (e.type === 'change') invalidate(e.collection === 'users' ? 'me' : e.collection);
        emitRealtime(e);
      };
      socket.onclose = () => {
        if (ws === socket) emitRealtime({ type: 'close' });
        if (closed) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    setRealtimeSender((msg) => {
      if (ws?.readyState !== 1) return false;
      ws.send(JSON.stringify(msg));
      return true;
    });
    connect();
    registerPush().catch(() => {});

    const sub = AppState.addEventListener('change', (s) => {
      if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'presence', active: s === 'active' }));
      if (s !== 'active') return;
      registerPush().catch(() => {});
      for (const c of ['me', 'space', 'places', 'visits', 'anniversaries', 'moments', 'todos', 'answers', 'capsules', 'gallery', 'albums', 'stickers', 'chat']) invalidate(c);
      if (ws && ws.readyState > 1) {
        clearTimeout(timer);
        connect();
      }
    });
    return () => {
      closed = true;
      clearTimeout(timer);
      setRealtimeSender(null);
      ws?.close();
      emitRealtime({ type: 'close' });
      sub.remove();
    };
  }, [status]);

  const onNudge = useCallback((fn: (e: NudgeEvent) => void) => onRealtime<NudgeEvent>('nudge', fn), []);

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
