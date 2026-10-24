import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Copy, FolderPlus, Heart, MapPin, MessageCircle, MoreHorizontal, Plus, Reply, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CommentComposer } from '@/components/CommentComposer';
import { MediaGrid } from '@/components/Media';
import { toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { QueryFallback, SkeletonList } from '@/components/Skeleton';
import { Sticker } from '@/components/Sticker';
import { Avatar, Button, Empty, IconButton, listItem, listMotion, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { mediaUrl } from '@/lib/media';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Comment, MediaItem, Moment, Place } from '@/lib/types';
import { undoable, usePendingDeletes } from '@/lib/undo';
import { openViewer } from '@/lib/viewer';
import { colors, radius, shadow, springs } from '@/theme';

const KEY = '/api/moments';

async function toggleLike(m: Moment, me: string, key: string) {
  const liked = !m.likedBy.includes(me);
  setQueryData<Moment[]>(key, (prev = []) => prev.map((x) => (x.id === m.id ? { ...x, likedBy: liked ? [...x.likedBy, me] : x.likedBy.filter((u) => u !== me) } : x)));
  await api.post(`/api/moments/${m.id}/like`).catch(() => {});
  invalidate('moments');
}

const mediaOf = (m: Moment): MediaItem[] => (m.media?.length ? m.media : m.photos.map((image) => ({ kind: 'image' as const, image })));

type MenuItem = { icon: typeof Trash2; label: string; hint?: string; danger?: boolean; onPress: () => void };

/** 底部操作菜单 */
function ActionSheet({ visible, onClose, items, title }: { visible: boolean; onClose: () => void; items: MenuItem[]; title?: string }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {title && (
        <Txt v="caption" numberOfLines={2} style={{ textAlign: 'center', marginTop: -4 }}>
          {title}
        </Txt>
      )}
      <View style={styles.menu}>
        {items.map((it, i) => (
          <PressScale
            key={it.label}
            onPress={() => {
              onClose();
              it.onPress();
            }}
            style={[styles.menuItem, i > 0 && styles.menuSep]}>
            <it.icon size={20} color={it.danger ? colors.danger : colors.inkSoft} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Txt v="body" color={it.danger ? colors.danger : colors.ink}>
                {it.label}
              </Txt>
              {it.hint && <Txt v="caption">{it.hint}</Txt>}
            </View>
          </PressScale>
        ))}
      </View>
      <Button title="取消" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

/** 一条评论：「森：好美」「雨 回复 森：下次一起去」，表情包 / 图片显示在下面 */
function CommentLine({ c, byId, onPress, onLongPress }: { c: Comment; byId: Map<string, Comment>; onPress: () => void; onLongPress: () => void }) {
  const { userName } = useCouple();
  const target = c.replyToId ? byId.get(c.replyToId) : undefined;
  return (
    <Animated.View entering={FadeIn} {...listMotion(150, 20)}>
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.comment, pressed && { backgroundColor: 'rgba(75,46,53,0.06)' }]}>
        <Text style={styles.commentText}>
          <Text style={styles.commentName}>{userName(c.createdBy)}</Text>
          {target && (
            <>
              <Text style={{ color: colors.muted }}> 回复 </Text>
              <Text style={styles.commentName}>{userName(target.createdBy)}</Text>
            </>
          )}
          <Text style={styles.commentName}>：</Text>
          {c.content}
        </Text>
        {c.sticker && (
          <View style={{ marginTop: 4 }}>
            <Sticker id={c.sticker} size={76} />
          </View>
        )}
        {c.image && (
          <Pressable onPress={() => openViewer([{ kind: 'image', image: c.image }], 0, { mode: 'plain' })} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            <Image source={mediaUrl(c.image, 'thumb')} style={styles.commentImage} contentFit="cover" transition={150} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

function MomentCard({ m, i, queryKey }: { m: Moment; i: number; queryKey: string }) {
  const { me, userById, userName } = useCouple();
  const places = useQuery<Place[]>('/api/places');
  const hidden = usePendingDeletes();
  const { width } = useWindowDimensions();
  const [commenting, setCommenting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [menu, setMenu] = useState(false);
  const [commentMenu, setCommentMenu] = useState<Comment | null>(null);
  const author = userById(m.createdBy);
  const mine = m.createdBy === me?.id;
  const liked = !!me && m.likedBy.includes(me.id);
  const place = places.data?.find((p) => p.id === m.placeId);
  const media = mediaOf(m);
  const comments = m.comments.filter((c) => !hidden.has(c.id));
  const byId = new Map(m.comments.map((c) => [c.id, c]));

  // 双击出现大爱心
  const big = useSharedValue(0);
  const heart = useSharedValue(1);
  const bigStyle = useAnimatedStyle(() => ({ opacity: big.value, transform: [{ scale: 0.4 + big.value * 0.8 }] }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const like = (fromDoubleTap = false) => {
    if (!me) return;
    if (fromDoubleTap && liked) {
      big.set(withSequence(withSpring(1, springs.bouncy), withTiming(0, { duration: 400 })));
      return;
    }
    if (!liked) big.set(withSequence(withSpring(1, springs.bouncy), withTiming(0, { duration: 400 })));
    heart.set(withSequence(withTiming(1.4, { duration: 100 }), withSpring(1, springs.bouncy)));
    haptic.medium();
    toggleLike(m, me.id, queryKey);
  };
  // 手指一动就不算双击（是在滑动）
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(10)
    .onEnd(() => scheduleOnRN(like, true));

  const startReply = (c: Comment | null) => {
    haptic.tick();
    setReplyTo(c);
    setCommenting(true);
  };

  const removeMoment = () => {
    let index = 0;
    undoable({
      id: m.id,
      message: mine ? '删掉了这条动态' : `删掉了${author?.name ?? 'TA'}的动态`,
      apply: () =>
        setQueryData<Moment[]>(queryKey, (prev = []) => {
          index = Math.max(0, prev.findIndex((x) => x.id === m.id));
          return prev.filter((x) => x.id !== m.id);
        }),
      revert: () => setQueryData<Moment[]>(queryKey, (prev = []) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(0, index), m, ...prev.slice(index)])),
      commit: async () => {
        await api.del(`/api/moments/${m.id}`);
        await invalidate('moments');
      },
    });
  };

  const removeComment = (c: Comment) =>
    undoable({
      id: c.id,
      message: '删掉了一条评论',
      apply: () => {},
      revert: () => {},
      commit: async () => {
        await api.del(`/api/comments/${c.id}`);
        await invalidate('moments');
      },
    });

  const saveToGallery = async () => {
    try {
      await api.post('/api/gallery/import', { media, takenAt: m.createdAt });
      haptic.success();
      toast(`已存入相册`, '✓');
      invalidate('gallery');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const contentWidth = Math.min(width, 720) - 32 - 36;
  const momentMenu: MenuItem[] = [
    ...(media.length ? [{ icon: FolderPlus, label: '存入相册', onPress: saveToGallery }] : []),
    ...(m.content ? [{ icon: Copy, label: '复制文字', onPress: () => Clipboard.setStringAsync(m.content ?? '').then(() => toast('已复制', '📋')) }] : []),
    { icon: Trash2, label: '删除', danger: true, onPress: removeMoment },
  ];
  const cm = commentMenu;
  const commentItems: MenuItem[] = cm
    ? [
        ...(cm.createdBy !== me?.id ? [{ icon: Reply, label: `回复 ${userName(cm.createdBy)}`, onPress: () => startReply(cm) }] : []),
        ...(cm.content ? [{ icon: Copy, label: '复制', onPress: () => Clipboard.setStringAsync(cm.content).then(() => toast('已复制', '📋')) }] : []),
        { icon: Trash2, label: '删除', danger: true, onPress: () => removeComment(cm) },
      ]
    : [];

  return (
    <Animated.View {...listItem(i)} style={styles.card}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <Avatar user={author} size={38} />
          <View>
            <Txt v="bodyStrong">
              {author?.name ?? ''} {m.mood ?? ''}
            </Txt>
            <Txt v="caption">{timeAgo(m.createdAt)}</Txt>
          </View>
        </Row>
        <Pressable hitSlop={10} accessibilityLabel="更多操作" onPress={() => (haptic.tick(), setMenu(true))} style={styles.more}>
          <MoreHorizontal size={20} color={colors.muted} />
        </Pressable>
      </Row>

      {/* 网页版默认会禁止从这里开始滑动页面（touch-action: none），从动态正文或照片上划不动；这里允许正常滑动 */}
      <GestureDetector gesture={doubleTap} touchAction="manipulation">
        <View collapsable={false} style={{ marginTop: 12, gap: 10 }}>
          {!!m.content && <Txt v="body">{m.content}</Txt>}
          <MediaGrid items={media} width={contentWidth} takenAt={m.createdAt} />
          <Animated.View pointerEvents="none" style={[styles.bigHeart, bigStyle]}>
            <Text style={{ fontSize: 90 }}>❤️</Text>
          </Animated.View>
        </View>
      </GestureDetector>

      {place && (
        <Pressable onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={styles.place}>
          <MapPin size={12} color={colors.butterInk} />
          <Txt v="caption" color={colors.butterInk} style={{ fontWeight: '600' }}>
            {place.name}
          </Txt>
        </Pressable>
      )}

      <Row gap={18} style={{ marginTop: 12 }}>
        <Pressable hitSlop={8} onPress={() => like()} accessibilityLabel={liked ? '取消点赞' : '点赞'}>
          <Row gap={6}>
            <Animated.View style={heartStyle}>
              <Heart size={22} color={liked ? colors.accent : colors.inkSoft} fill={liked ? colors.accent : 'transparent'} strokeWidth={2} />
            </Animated.View>
            {m.likedBy.length > 0 && <Txt v="caption">{m.likedBy.map((u) => userName(u)).join('、')}</Txt>}
          </Row>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => (commenting && !replyTo ? setCommenting(false) : startReply(null))} accessibilityLabel="评论">
          <Row gap={5}>
            <MessageCircle size={21} color={commenting ? colors.accentStrong : colors.inkSoft} strokeWidth={2} />
            {comments.length > 0 && <Txt v="caption">{comments.length}</Txt>}
          </Row>
        </Pressable>
      </Row>

      {comments.length > 0 && (
        <View style={styles.comments}>
          {comments.map((c) => (
            <CommentLine
              key={c.id}
              c={c}
              byId={byId}
              // 点别人的评论 = 回复 TA；点自己的 = 操作菜单（和微信一样）
              onPress={() => (c.createdBy === me?.id ? setCommentMenu(c) : startReply(c))}
              onLongPress={() => (haptic.medium(), setCommentMenu(c))}
            />
          ))}
        </View>
      )}

      {commenting && (
        <CommentComposer
          key={replyTo?.id ?? 'root'}
          momentId={m.id}
          replyTo={replyTo ? { id: replyTo.id, name: userName(replyTo.createdBy) } : null}
          onCancelReply={() => setReplyTo(null)}
          onSent={() => {
            setCommenting(false);
            setReplyTo(null);
          }}
        />
      )}

      <ActionSheet visible={menu} onClose={() => setMenu(false)} items={momentMenu} />
      <ActionSheet visible={!!commentMenu} onClose={() => setCommentMenu(null)} items={commentItems} title={cm?.content || (cm?.sticker ? '[表情]' : cm?.image ? '[图片]' : undefined)} />
    </Animated.View>
  );
}

export default function Moments() {
  return (
    <Screen tab title="动态" onRefresh={async () => invalidate('moments')} right={<IconButton icon={Plus} onPress={() => router.push('/moment/new')} label="发动态" />}>
      <MomentPage queryKey={KEY} seen={[]} />
    </Screen>
  );
}

function MomentPage({ queryKey, seen }: { queryKey: string; seen: string[] }) {
  const moments = useQuery<Moment[]>(queryKey);
  const hidden = usePendingDeletes();
  const [next, setNext] = useState<string | null>(null);
  const rows = moments.data ?? [];
  const last = rows.at(-1);
  return (
    <View style={{ gap: 14 }}>
      {queryKey === KEY && moments.data && rows.length === 0 && (
        <Empty emoji="📷" title="发第一条动态吧" action={<Button title="写点什么" onPress={() => router.push('/moment/new')} />} />
      )}
      {rows
        .filter((m) => !seen.includes(m.id) && !hidden.has(m.id))
        .map((m, i) => (
          <MomentCard key={m.id} m={m} i={i} queryKey={queryKey} />
        ))}
      {queryKey === KEY ? <QueryFallback q={moments} count={2} /> : !moments.data && !moments.error && <SkeletonList count={1} />}
      {moments.error && (moments.data || queryKey !== KEY) && <Button title="加载失败，点此重试" variant="ghost" onPress={() => void moments.refresh()} />}
      {next ? (
        <MomentPage queryKey={next} seen={[...seen, ...rows.map((m) => m.id)]} />
      ) : last && rows.length === 30 ? (
        <Button title="查看更早的动态" variant="ghost" onPress={() => setNext(`${KEY}?before=${encodeURIComponent(`${last.createdAt}|${last.id}`)}`)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderCurve: 'continuous', ...shadow },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bigHeart: { position: 'absolute', alignSelf: 'center', top: '30%' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.butter, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  comments: { marginTop: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 4 },
  comment: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  commentText: { fontSize: 14, lineHeight: 21, color: colors.ink },
  commentName: { color: colors.pinkInk, fontWeight: '700' },
  commentImage: { width: 110, height: 110, borderRadius: 10, backgroundColor: colors.surface },
  menu: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  menuSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
