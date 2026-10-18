import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { chatPreview } from '@/lib/chat';
import { haptic } from '@/lib/haptics';
import { isViewerOpen, joinCoview, type Reaction } from '@/lib/peer';
import { onRealtime } from '@/lib/realtime';
import { reactionText } from '@/lib/stickers';
import { useCouple } from '@/lib/session';
import type { ChatMessage } from '@/lib/types';
import { openViewerById } from '@/lib/viewer';

import { toast } from './motion';

/**
 * 在 App 里任何页面收到的实时消息：
 * - 聊天新消息（不在聊天页时），点一下进聊天
 * - 「给你看这张」，点「看看」打开那张
 * - 「一起看」邀请，点「加入」
 * - 在相册里给照片的回应（查看器开着时由查看器自己显示）
 */
export function RealtimeToasts() {
  const { partner, me } = useCouple();
  const pathname = usePathname();
  const name = partner?.name || 'TA';
  const path = useRef(pathname);
  const nameRef = useRef(name);
  const meRef = useRef(me);
  useEffect(() => {
    path.current = pathname;
    nameRef.current = name;
    meRef.current = me;
  });

  useEffect(() => {
    const open = (id: string) => openViewerById(id).catch((e) => toast((e as Error).message, '⚠️'));
    const offs = [
      onRealtime<{ message: ChatMessage }>('chat', ({ message: m }) => {
        // 照片卡片由「给你看」的提示处理
        if (m.kind === 'photo' || path.current === '/chat') return;
        haptic.tap();
        toast(`${nameRef.current}：${chatPreview(m)}`, '💬', undefined, { onPress: () => router.push('/chat'), duration: 4000, showEmoji: true });
      }),
      onRealtime<{ itemId: string }>('show', ({ itemId }) => {
        haptic.medium();
        toast(`${nameRef.current} 想给你看这张`, '👉', undefined, { action: { label: '看看', onPress: () => open(itemId) }, duration: 8000, showEmoji: true });
      }),
      onRealtime<{ action: string; itemId?: string }>('coview', (e) => {
        if (e.action !== 'invite' || !e.itemId) return;
        const itemId = e.itemId;
        haptic.medium();
        toast(`${nameRef.current} 邀请你一起看照片`, '👥', undefined, {
          duration: 12_000,
          showEmoji: true,
          action: {
            label: '加入',
            onPress: () => {
              if (meRef.current?.shareViewing === false) return toast('先在设置里打开「让 TA 看到我在看哪张」', 'ℹ️');
              if (!joinCoview(itemId)) return toast('连接断开了，稍等一下', '⚠️');
              if (!isViewerOpen()) open(itemId);
            },
          },
        });
      }),
      onRealtime<Reaction>('react', (r) => {
        if (isViewerOpen()) return;
        toast(`${nameRef.current} 对一张照片：${reactionText(r)}`, '💬', undefined, { action: { label: '看看', onPress: () => open(r.itemId) }, showEmoji: true });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return null;
}
