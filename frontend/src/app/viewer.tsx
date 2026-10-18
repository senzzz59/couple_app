import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Download, FolderPlus, Heart, ImageDown, PenLine, Send, Trash2, Users, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumPicker } from '@/components/AlbumPicker';
import { LivePhoto } from '@/components/Media';
import { toast } from '@/components/motion';
import { goBack } from '@/components/Screen';
import { Avatar, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { Video } from '@/components/Video';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { fmtSize, mediaUrl } from '@/lib/media';
import { claimLook, coviewGoto, inviteCoview, leaveCoview, onCoview, sendReaction, setViewerOpen, useCoview, usePeer, type Reaction } from '@/lib/peer';
import { onRealtime } from '@/lib/realtime';
import { useCouple } from '@/lib/session';
import { invalidate } from '@/lib/store';
import type { GalleryItem } from '@/lib/types';
import { galleryEntry, saveEntry, viewerSession, type ViewerEntry, type ViewerSession } from '@/lib/viewer';
import { colors, radius } from '@/theme';

const fmtWhen = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const QUICK = ['💗', '😂', '😍', '👀'];
const QUICK_TEXT = '就这张！';

type Floating = Reaction & { key: number };

/** 全屏查看：左右滑动翻页，图片 / 视频 / Live 图都能看；相册里的还能收藏、加入相册、删除，给 TA 看、一起看 */
export default function Viewer() {
  const params = useLocalSearchParams<{ photos?: string; index?: string; item?: string }>();
  // 旧入口：?photos=a.jpg,b.jpg；通知点进来：?item=<相册照片 id>
  const [session] = useState<ViewerSession | null>(() => {
    const s = viewerSession();
    if (params.item) return s && s.items[s.index]?.id === params.item ? s : null;
    if (s) return s;
    const list = (params.photos ?? '').split(',').filter(Boolean);
    return list.length ? { items: list.map((image) => ({ kind: 'image', image })), index: Number(params.index) || 0, mode: 'plain' } : null;
  });
  const [items, setItems] = useState<ViewerEntry[]>(session?.items ?? []);
  const [loadingItem, setLoadingItem] = useState(!session && !!params.item);
  const [cur, setCur] = useState(Math.min(session?.index ?? 0, Math.max(0, (session?.items.length ?? 1) - 1)));
  const [chrome, setChrome] = useState(true);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showing, setShowing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [floating, setFloating] = useState<Floating[]>([]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ViewerEntry>>(null);
  const { userName, partner, me } = useCouple();
  const peer = usePeer();
  const coview = useCoview();
  const mode = session?.mode ?? (params.item ? 'gallery' : 'plain');
  const item = items[cur];
  const shared = mode === 'gallery' && !!item?.id;
  const partnerName = partner?.name || 'TA';
  const shareOn = me?.shareViewing !== false;

  // ---- 通知点进来：按 id 拉这一张
  useEffect(() => {
    if (!loadingItem || !params.item) return;
    api
      .get<GalleryItem>(`/api/gallery/${params.item}`)
      .then((g) => setItems([galleryEntry(g)]))
      .catch((e) => toast((e as Error).message, '⚠️'))
      .finally(() => setLoadingItem(false));
  }, [loadingItem, params.item]);

  useEffect(() => {
    if (!loadingItem && (!items.length || (!session && !params.item))) goBack();
  }, [session, items.length, loadingItem, params.item]);

  // ---- 告诉另一半我在看哪张（只有相册里的照片）
  const look = useRef<ReturnType<typeof claimLook> | null>(null);
  useEffect(() => {
    setViewerOpen(true);
    return () => {
      setViewerOpen(false);
      look.current?.release();
      look.current = null;
      leaveCoview();
    };
  }, []);
  const lookId = shared ? item!.id! : null;
  useEffect(() => {
    if (!lookId) {
      look.current?.release();
      look.current = null;
      return;
    }
    if (look.current) look.current.update(lookId);
    else look.current = claimLook('viewer', lookId);
  }, [lookId]);

  // ---- 一起看：我翻页 → 告诉对方；对方翻页 → 我跟过去（跟过去的不再回发）
  const following = useRef<string | null>(null);
  useEffect(() => {
    if (coview.status !== 'active' || !lookId) return;
    if (following.current === lookId) {
      following.current = null;
      return;
    }
    const t = setTimeout(() => coviewGoto(lookId), 300);
    return () => clearTimeout(t);
  }, [lookId, coview.status]);

  const itemsRef = useRef(items);
  const curRef = useRef(cur);
  useEffect(() => {
    itemsRef.current = items;
    curRef.current = cur;
  });
  const jumpTo = async (id: string) => {
    let idx = itemsRef.current.findIndex((x) => x.id === id);
    if (idx < 0) {
      try {
        const g = await api.get<GalleryItem>(`/api/gallery/${id}`);
        const entry = galleryEntry(g);
        const next = [...itemsRef.current];
        // 按拍摄时间插进去（列表是新的在前）
        let at = next.findIndex((x) => (x.takenAt ?? '') < (entry.takenAt ?? ''));
        if (at < 0) at = next.length;
        next.splice(at, 0, entry);
        itemsRef.current = next;
        setItems(next);
        idx = at;
      } catch (e) {
        toast((e as Error).message, '⚠️');
        return;
      }
    }
    following.current = id;
    setCur(idx);
    setTimeout(() => list.current?.scrollToIndex({ index: idx, animated: false }), 30);
  };

  useEffect(
    () =>
      onCoview((e) => {
        if (e.action === 'goto' && e.itemId) jumpTo(e.itemId);
        else if (e.action === 'join') {
          haptic.success();
          toast(`${partnerName} 加入了，一起看吧`, '👥', undefined, { showEmoji: true });
        } else if (e.action === 'leave') toast(`${partnerName} 退出了一起看`, '👋', undefined, { showEmoji: true });
      }),
    [partnerName]
  );

  // 刚开始一起看：两个人都先到邀请的那张
  const wasActive = useRef(coview.status === 'active');
  useEffect(() => {
    const active = coview.status === 'active';
    if (active && !wasActive.current && coview.itemId && coview.itemId !== lookId) jumpTo(coview.itemId);
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coview.status, coview.itemId]);

  // ---- 对方发来的回应：在看同一张就飘在照片上，否则顶部提示
  useEffect(
    () =>
      onRealtime<Reaction>('react', (r) => {
        const here = itemsRef.current[curRef.current]?.id === r.itemId;
        if (here) {
          haptic.tap();
          const key = Date.now() + Math.random();
          setFloating((xs) => [...xs.slice(-4), { ...r, key }]);
          setTimeout(() => setFloating((xs) => xs.filter((x) => x.key !== key)), 3200);
        } else {
          toast(`${partnerName} 对另一张：${r.emoji ?? r.text}`, '💬', undefined, { action: { label: '看看', onPress: () => jumpTo(r.itemId) }, showEmoji: true });
        }
      }),
    [partnerName]
  );
  const go = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    if (next === cur) return;
    list.current?.scrollToIndex({ index: next, animated: true });
    setCur(next);
  };

  // 电脑上：方向键翻页，Esc 关闭
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (writing) return;
      if (e.key === 'ArrowRight') go(cur + 1);
      else if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key === 'Escape') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item)
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        {loadingItem && <ActivityIndicator color={colors.white} />}
      </View>
    );

  const save = async () => {
    setSaving(true);
    try {
      const r = await saveEntry(item);
      if (r === 'downloaded') toast(item.original ? '开始下载原图' : '开始下载');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async () => {
    if (!item.id) return;
    const favorite = !item.favorite;
    haptic.tap();
    setItems((xs) => xs.map((x, i) => (i === cur ? { ...x, favorite } : x)));
    try {
      await api.patch(`/api/gallery/${item.id}`, { favorite });
      invalidate('gallery');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const remove = async () => {
    if (!item.id || !(await confirm('从相册删除？', '两个人的相册里都会删除，所在的所有相册里也会一起消失'))) return;
    try {
      await api.post('/api/gallery/batch', { ids: [item.id], action: 'delete' });
      haptic.success();
      invalidate('gallery');
      const next = items.filter((_, i) => i !== cur);
      setItems(next);
      setCur((c) => Math.min(c, next.length - 1));
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const importToGallery = async () => {
    try {
      await api.post('/api/gallery/import', { media: [{ kind: item.kind, image: item.image, video: item.video, w: item.w, h: item.h, duration: item.duration }], takenAt: session?.takenAt });
      haptic.success();
      toast('已存入相册', '✓');
      invalidate('gallery');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  // 给 TA 看：聊天里留一张照片卡片，TA 在线就弹提示，不在线就推送
  const showToPartner = async () => {
    if (!item.id || showing) return;
    setShowing(true);
    try {
      await api.post('/api/chat/messages', { kind: 'photo', galleryId: item.id });
      haptic.success();
      toast(peer.online ? `已经给${partnerName}看了` : `已发给${partnerName}，TA 打开就能看到`, '👉');
      invalidate('chat');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setShowing(false);
    }
  };

  const react = (r: { emoji: string } | { text: string }) => {
    if (!item.id) return;
    haptic.tick();
    if (!sendReaction(item.id, r)) toast('连接断开了，稍等一下', '⚠️');
  };

  const startCoview = () => {
    if (!item.id) return;
    if (!shareOn) return toast('先在设置里打开「让 TA 看到我在看哪张」', 'ℹ️');
    if (coview.status === 'inviting') return leaveCoview();
    if (inviteCoview(item.id)) toast(`已邀请${partnerName}一起看`, '👥');
  };

  const page = ({ item: e, index }: { item: ViewerEntry; index: number }) => {
    const active = index === cur;
    const box = { width, height };
    return (
      <Pressable onPress={() => setChrome((c) => !c)} style={[box, { justifyContent: 'center', alignItems: 'center' }]}>
        {e.kind === 'video' && e.video ? (
          active ? (
            <Video uri={mediaUrl(e.video)!} poster={mediaUrl(e.image)} autoPlay style={{ width, height: height - insets.top - insets.bottom - 140 }} />
          ) : (
            <Image source={mediaUrl(e.image, 'thumb')} style={{ width, height: height * 0.8 }} contentFit="contain" />
          )
        ) : e.kind === 'live' && e.video ? (
          <LivePhoto key={active ? 'a' : 'i'} item={e} fit="contain" autoPlay={active} onPress={() => setChrome((c) => !c)} style={{ width, height: height * 0.8 }} />
        ) : (
          <Image source={mediaUrl(e.image)} placeholder={mediaUrl(e.image, 'thumb')} style={{ width, height: height * 0.8 }} contentFit="contain" transition={200} />
        )}
      </Pressable>
    );
  };

  const who = item.createdBy ? userName(item.createdBy) : '';
  const peerHere = shared && peer.online && peer.where === 'viewer' && peer.itemId === item.id;
  const peerElsewhere = shared && peer.online && peer.where === 'viewer' && !!peer.itemId && peer.itemId !== item.id;
  const canCoview = shared && peer.online && !!peer.where && coview.status !== 'active';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' }}>
      <FlatList
        ref={list}
        data={items}
        extraData={cur}
        horizontal
        pagingEnabled
        initialScrollIndex={cur}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(x, i) => `${x.id ?? x.image ?? x.video}-${i}`}
        onMomentumScrollEnd={(e) => setCur(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={Platform.OS === 'web' ? (e) => setCur(Math.round(e.nativeEvent.contentOffset.x / width)) : undefined}
        scrollEventThrottle={64}
        renderItem={page}
      />

      {/* 对方发来的回应：从右下往上飘，几秒后消失 */}
      <View pointerEvents="none" style={[styles.floatBox, { bottom: insets.bottom + (shared ? 190 : 120) }]}>
        {floating.map((f) => (
          <Animated.View key={f.key} entering={FadeInDown.springify().damping(14)} exiting={FadeOut.duration(400)} style={styles.floatItem}>
            <Avatar user={partner} size={26} ring="rgba(255,255,255,0.9)" />
            {f.emoji ? (
              <Text style={{ fontSize: 30 }}>{f.emoji}</Text>
            ) : (
              <View style={styles.floatText}>
                <Txt v="bodyStrong" color={colors.ink}>
                  {f.text}
                </Txt>
              </View>
            )}
          </Animated.View>
        ))}
      </View>

      {(chrome || coview.status === 'active') && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" color={colors.white}>
              {items.length > 1 ? `${cur + 1} / ${items.length}` : ' '}
            </Txt>
            {(item.takenAt || who) && (
              <Txt v="caption" color="rgba(255,255,255,0.65)" numberOfLines={1}>
                {[fmtWhen(item.takenAt), who && `${who} 上传`, fmtSize(item.size)].filter(Boolean).join(' · ')}
              </Txt>
            )}
          </View>
          {coview.status === 'active' ? (
            <PressScale onPress={leaveCoview} style={[styles.pill, styles.pillLive]} accessibilityLabel="退出一起看">
              <Users size={14} color={colors.white} />
              <Txt v="caption" color={colors.white} style={styles.pillText}>
                和{partnerName}一起看 · 退出
              </Txt>
            </PressScale>
          ) : peerHere ? (
            <View style={[styles.pill, styles.pillHere]}>
              <Avatar user={partner} size={20} />
              <Txt v="caption" color={colors.white} style={styles.pillText}>
                {partnerName}也在看这张
              </Txt>
            </View>
          ) : peerElsewhere ? (
            <PressScale onPress={() => jumpTo(peer.itemId!)} style={styles.pill} accessibilityLabel={`去看${partnerName}在看的那张`}>
              <Avatar user={partner} size={20} />
              <Txt v="caption" color={colors.white} style={styles.pillText}>
                {partnerName}在看另一张
              </Txt>
              <ChevronRight size={14} color={colors.white} />
            </PressScale>
          ) : null}
          {canCoview && chrome && (
            <PressScale onPress={startCoview} style={[styles.pill, coview.status === 'inviting' && styles.pillLive]} accessibilityLabel="一起看">
              <Users size={14} color={colors.white} />
              <Txt v="caption" color={colors.white} style={styles.pillText}>
                {coview.status === 'inviting' ? '等 TA 加入…' : '一起看'}
              </Txt>
            </PressScale>
          )}
          <IconButton icon={X} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={goBack} label="关闭" />
        </Animated.View>
      )}

      {chrome && Platform.OS === 'web' && width > 700 && items.length > 1 && (
        <>
          {cur > 0 && (
            <View style={[styles.arrow, { left: 16 }]}>
              <IconButton icon={ChevronLeft} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={() => go(cur - 1)} />
            </View>
          )}
          {cur < items.length - 1 && (
            <View style={[styles.arrow, { right: 16 }]}>
              <IconButton icon={ChevronRight} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={() => go(cur + 1)} />
            </View>
          )}
        </>
      )}

      {chrome && mode !== 'plain' && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          {shared && peer.online && (
            <Row gap={8} style={{ justifyContent: 'center', marginBottom: 12 }}>
              {QUICK.map((e) => (
                <PressScale key={e} scaleTo={0.8} onPress={() => react({ emoji: e })} style={styles.quick} accessibilityLabel={`回应 ${e}`}>
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </PressScale>
              ))}
              <PressScale scaleTo={0.9} onPress={() => react({ text: QUICK_TEXT })} style={[styles.quick, styles.quickWide]}>
                <Txt v="caption" color={colors.white} style={{ fontWeight: '700' }} numberOfLines={1}>
                  {QUICK_TEXT}
                </Txt>
              </PressScale>
              <PressScale scaleTo={0.85} onPress={() => setWriting(true)} style={styles.quick} accessibilityLabel="说一句">
                <PenLine size={17} color={colors.white} />
              </PressScale>
            </Row>
          )}
          <Row gap={8} style={{ justifyContent: 'center' }}>
            <Action icon={Platform.OS === 'web' && /iPhone|iPad|Android/i.test(globalThis.navigator?.userAgent ?? '') ? ImageDown : Download} label={saving ? '准备中…' : item.original ? '保存原图' : '保存'} onPress={save} />
            {shared && (
              <>
                <Action icon={Heart} label={item.favorite ? '已收藏' : '收藏'} active={item.favorite} onPress={toggleFavorite} />
                <Action icon={FolderPlus} label="放进相册" onPress={() => setPicker(true)} />
                <Action icon={Send} label={showing ? '发送中…' : '给TA看'} onPress={showToPartner} />
                <Action icon={Trash2} label="删除" onPress={remove} />
              </>
            )}
            {mode === 'moment' && <Action icon={FolderPlus} label="存进相册" onPress={importToGallery} />}
          </Row>
        </Animated.View>
      )}
      {mode === 'plain' && chrome && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <Row style={{ justifyContent: 'center' }}>
            <Action icon={Download} label="保存" onPress={save} />
          </Row>
        </View>
      )}
      {writing && <SayLine onClose={() => setWriting(false)} onSend={(text) => react({ text })} bottom={insets.bottom} />}
      {item.id && <AlbumPicker visible={picker} onClose={() => setPicker(false)} ids={[item.id]} exclude={session?.albumId} />}
    </Animated.View>
  );
}

/** 说一句：小输入框，最多 30 个字，发完就收起 */
function SayLine({ onClose, onSend, bottom }: { onClose: () => void; onSend: (text: string) => void; bottom: number }) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (t) onSend(t);
    onClose();
  };
  return (
    <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={[styles.say, { paddingBottom: bottom + 12 }]}>
      <Row gap={8} style={styles.sayBox}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          maxLength={30}
          placeholder="说一句，TA 马上能看到"
          placeholderTextColor={colors.faint}
          returnKeyType="send"
          onSubmitEditing={send}
          onBlur={() => !text.trim() && onClose()}
          style={styles.sayInput}
        />
        <PressScale onPress={send} style={styles.saySend} accessibilityLabel="发送">
          <Send size={16} color={colors.white} />
        </PressScale>
      </Row>
    </Animated.View>
  );
}

function Action({ icon: Icon, label, onPress, active }: { icon: typeof Heart; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressScale onPress={onPress} style={styles.action}>
      <Icon size={20} color={active ? colors.accent : colors.white} fill={active ? colors.accent : 'transparent'} strokeWidth={2} />
      <Txt v="caption" color="rgba(255,255,255,0.85)" style={{ fontSize: 11 }} numberOfLines={1}>
        {label}
      </Txt>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 8 },
  arrow: { position: 'absolute', top: '50%', marginTop: -22 },
  action: { minWidth: 58, flexShrink: 1, alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 6, paddingRight: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.15)', flexShrink: 1 },
  pillHere: { backgroundColor: 'rgba(76,175,120,0.55)' },
  pillLive: { backgroundColor: colors.accentStrong, paddingLeft: 10 },
  pillText: { fontWeight: '700', flexShrink: 1 },
  quick: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  quickWide: { width: 'auto', paddingHorizontal: 12 },
  floatBox: { position: 'absolute', right: 18, alignItems: 'flex-end', gap: 8 },
  floatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatText: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 240 },
  say: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10, backgroundColor: 'rgba(0,0,0,0.85)' },
  sayBox: { backgroundColor: colors.white, borderRadius: radius.pill, paddingLeft: 16, paddingRight: 4, height: 46 },
  sayInput: { flex: 1, minWidth: 0, fontSize: 15, color: colors.ink, height: 46 },
  saySend: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
});
