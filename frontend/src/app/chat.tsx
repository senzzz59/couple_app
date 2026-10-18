import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, Copy, Reply, Undo2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble, expressiveSymbol } from '@/components/chat/ChatBubble';
import { emojiRain } from '@/components/Effects';
import { ChatComposer, type ReplyTarget } from '@/components/chat/ChatComposer';
import { toast } from '@/components/motion';
import { CENTERED, goBack } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { LoadError } from '@/components/Skeleton';
import { Avatar, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { chatTime, freshMessage, onFreshMessage, RECALL_MS, TIME_GAP_MS } from '@/lib/chat';
import { haptic } from '@/lib/haptics';
import { usePeer } from '@/lib/peer';
import { onRealtime } from '@/lib/realtime';
import { rainFor } from '@/lib/stickers';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { ChatMessage, ChatUnread } from '@/lib/types';
import { stopVoice } from '@/lib/voice';
import { colors, radius } from '@/theme';

const PAGE = 50;

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { me, partner, userById, userName } = useCouple();
  const peer = usePeer();
  const latest = useQuery<ChatMessage[]>('/api/chat/messages');
  const unread = useQuery<ChatUnread>('/api/chat/unread');
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  // 打开菜单的时间：决定还能不能撤回
  const [menuAt, setMenuAt] = useState(0);
  const [focused, setFocused] = useState(false);
  // 菜单收起后把光标放进输入框（选了「回复」时）
  const [focusSignal, setFocusSignal] = useState(0);
  const replyPicked = useRef(false);
  const list = useRef<FlatList<ChatMessage>>(null);

  // ---- 表情特效：自己刚发的、对方刚发来的（翻历史不放）
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const offFresh = onFreshMessage((m) => {
      if (!expressiveSymbol(m)) return;
      setFresh((s) => new Set(s).add(m.id));
      const rain = rainFor(m);
      if (rain) emojiRain(rain);
      if (m.createdBy !== me?.id) haptic.medium();
    });
    // 对方的新消息只会从实时通道来
    const offChat = onRealtime<{ message: ChatMessage }>('chat', ({ message }) => {
      setQueryData<ChatMessage[]>('/api/chat/messages', (prev) => [message, ...(prev ?? []).filter((x) => x.id !== message.id)]);
      freshMessage(message);
    });
    return () => {
      offFresh();
      offChat();
    };
  }, [me?.id]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        stopVoice();
      };
    }, [])
  );

  // 最新一页 + 往上翻加载的更早的，按时间新的在前
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(latest.data ?? []), ...older].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [latest.data, older]);

  // 第一页就不满，说明没有更早的了
  const hasMore = more && !(latest.data && latest.data.length < PAGE && !older.length);

  // ---- 打开着、在前台、有未读：标为已读
  const unreadCount = unread.data?.count ?? 0;
  useEffect(() => {
    if (!focused || !unreadCount) return;
    const mark = () => AppState.currentState === 'active' && api.post('/api/chat/read').then(() => invalidate('chat/unread')).catch(() => {});
    mark();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && mark());
    return () => sub.remove();
  }, [focused, unreadCount, latest.data]);

  const loadOlder = async () => {
    const last = messages.at(-1);
    if (!hasMore || loadingOlder || !last) return;
    setLoadingOlder(true);
    try {
      const page = await api.get<ChatMessage[]>(`/api/chat/messages?before=${last.id}&limit=${PAGE}`);
      setOlder((xs) => [...xs, ...page]);
      if (page.length < PAGE) setMore(false);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setLoadingOlder(false);
    }
  };

  // 对方读到哪：我最新一条被读过就显示「已读」
  const partnerReadAt = unread.data?.partnerReadAt ? new Date(unread.data.partnerReadAt).getTime() : 0;
  const myLatest = messages.find((m) => m.createdBy === me?.id);
  const readId = myLatest && partnerReadAt >= new Date(myLatest.createdAt).getTime() ? myLatest.id : null;

  const recall = async (m: ChatMessage) => {
    setMenu(null);
    try {
      await api.del(`/api/chat/messages/${m.id}`);
      haptic.success();
      setQueryData<ChatMessage[]>('/api/chat/messages', (prev) => (prev ?? []).filter((x) => x.id !== m.id));
      setOlder((xs) => xs.filter((x) => x.id !== m.id));
      invalidate('chat');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const copy = async (m: ChatMessage) => {
    setMenu(null);
    try {
      await Clipboard.setStringAsync(m.content ?? '');
      toast('已复制', '✓');
    } catch {
      toast('复制失败', '⚠️');
    }
  };

  const name = partner?.name || 'TA';
  const status = peer.online ? (peer.where ? '在线 · 在看相册' : '在线') : '';
  const canRecall = (m: ChatMessage) => m.createdBy === me?.id && menuAt - new Date(m.createdAt).getTime() < RECALL_MS;

  const render = ({ item: m, index }: { item: ChatMessage; index: number }) => {
    const prev = messages[index + 1];
    const showTime = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > TIME_GAP_MS;
    const mine = m.createdBy === me?.id;
    return (
      <View>
        {showTime && (
          <Txt v="caption" style={styles.time}>
            {chatTime(m.createdAt)}
          </Txt>
        )}
        <ChatBubble
          m={m}
          mine={mine}
          author={userById(m.createdBy)}
          authorName={(id) => userName(id) || 'TA'}
          read={m.id === readId}
          fresh={fresh.has(m.id)}
          onLongPress={() => {
            haptic.medium();
            setMenuAt(Date.now());
            setMenu(m);
          }}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Row gap={10} style={CENTERED}>
          <IconButton icon={ChevronLeft} onPress={goBack} label="返回" />
          <View>
            <Avatar user={partner} size={38} />
            {peer.online && <View style={styles.online} />}
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" numberOfLines={1}>
              {name}
            </Txt>
            {!!status && (
              <Txt v="caption" color="#3E9A68">
                {status}
              </Txt>
            )}
          </View>
        </Row>
      </View>

      {latest.error && !latest.data ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <LoadError message={latest.error} onRetry={latest.refresh} />
        </View>
      ) : !latest.data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 32 }}>
          <Txt style={{ fontSize: 40 }}>💬</Txt>
          <Txt v="bodyStrong">和{name}说点什么吧</Txt>
          <Txt v="secondary" style={{ textAlign: 'center' }}>
            在相册里点「给TA看」的照片也会出现在这里
          </Txt>
        </View>
      ) : (
        <FlatList
          ref={list}
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={render}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[{ paddingVertical: 12 }, CENTERED]}
          ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.muted} style={{ margin: 12 }} /> : null}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={CENTERED}>
          <ChatComposer
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSent={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
            focusSignal={focusSignal}
          />
        </View>
      </View>

      <Sheet
        visible={!!menu}
        onClose={() => setMenu(null)}
        onClosed={() => {
          if (!replyPicked.current) return;
          replyPicked.current = false;
          setFocusSignal((n) => n + 1);
        }}>
        {menu && (
          <View style={{ gap: 4 }}>
            <MenuRow
              icon={Reply}
              label="回复"
              onPress={() => {
                setReplyTo({ id: menu.id, name: userName(menu.createdBy) || 'TA', message: menu });
                replyPicked.current = true;
                setMenu(null);
              }}
            />
            {menu.kind === 'text' && <MenuRow icon={Copy} label="复制" onPress={() => copy(menu)} />}
            {canRecall(menu) && <MenuRow icon={Undo2} label="撤回" danger onPress={() => recall(menu)} />}
          </View>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function MenuRow({ icon: Icon, label, onPress, danger }: { icon: typeof Reply; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <PressScale scaleTo={0.98} onPress={onPress} style={styles.menuRow}>
      <Icon size={20} color={danger ? colors.danger : colors.inkSoft} />
      <Txt v="bodyStrong" color={danger ? colors.danger : colors.ink}>
        {label}
      </Txt>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingBottom: 8, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  online: { position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#4CAF78', borderWidth: 2, borderColor: colors.bg },
  time: { textAlign: 'center', marginVertical: 10, fontSize: 12 },
  composer: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 54, borderRadius: radius.md, backgroundColor: colors.surface },
});
