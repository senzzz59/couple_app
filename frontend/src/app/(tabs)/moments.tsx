import { router } from 'expo-router';
import { Heart, MapPin, MessageCircle, MoreHorizontal, Plus, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PhotoGrid } from '@/components/Photos';
import { Screen } from '@/components/Screen';
import { toast } from '@/components/motion';
import { Avatar, Button, Empty, enter, IconButton, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { timeAgo } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Moment, Place } from '@/lib/types';
import { colors, radius, shadow, springs } from '@/theme';

const KEY = '/api/moments';

async function toggleLike(m: Moment, me: string, key: string) {
  const liked = !m.likedBy.includes(me);
  setQueryData<Moment[]>(key, (prev = []) => prev.map((x) => (x.id === m.id ? { ...x, likedBy: liked ? [...x.likedBy, me] : x.likedBy.filter((u) => u !== me) } : x)));
  await api.post(`/api/moments/${m.id}/like`).catch(() => {});
  invalidate('moments');
}

function MomentCard({ m, i, queryKey }: { m: Moment; i: number; queryKey: string }) {
  const { me, userById, userName } = useCouple();
  const places = useQuery<Place[]>('/api/places');
  const { width } = useWindowDimensions();
  const [commenting, setCommenting] = useState(false);
  const [text, setText] = useState('');
  const author = userById(m.createdBy);
  const liked = !!me && m.likedBy.includes(me.id);
  const place = places.data?.find((p) => p.id === m.placeId);

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
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => scheduleOnRN(like, true));

  const sendComment = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setCommenting(false);
    haptic.success();
    await api.post('/api/comments', { momentId: m.id, content }).catch((e) => toast(e.message, '⚠️'));
    invalidate('moments');
  };

  const more = async () => {
    if (m.createdBy !== me?.id || !(await confirm('删除这条动态？', '删除后两个人都看不到了'))) return;
    await api.del(`/api/moments/${m.id}`);
    invalidate('moments');
  };

  const contentWidth = width - 32 - 36;
  return (
    <Animated.View entering={enter(i)} exiting={FadeOut} layout={LinearTransition.springify().damping(18)} style={styles.card}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <Avatar user={author} size={36} />
          <View>
            <Txt v="bodyStrong">
              {author?.name ?? ''} {m.mood ?? ''}
            </Txt>
            <Txt v="caption">{timeAgo(m.createdAt)}</Txt>
          </View>
        </Row>
        {m.createdBy === me?.id && (
          <Pressable hitSlop={10} onPress={more}>
            <MoreHorizontal size={20} color={colors.muted} />
          </Pressable>
        )}
      </Row>

      <GestureDetector gesture={doubleTap}>
        <View collapsable={false} style={{ marginTop: 12, gap: 10 }}>
          {!!m.content && <Txt v="body">{m.content}</Txt>}
          <PhotoGrid photos={m.photos} width={contentWidth} />
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
        <Pressable hitSlop={8} onPress={() => like()}>
          <Row gap={6}>
            <Animated.View style={heartStyle}>
              <Heart size={22} color={liked ? colors.accent : colors.inkSoft} fill={liked ? colors.accent : 'transparent'} strokeWidth={2} />
            </Animated.View>
            {m.likedBy.length > 0 && (
              <Txt v="caption">{m.likedBy.map((u) => userName(u)).join('、')}</Txt>
            )}
          </Row>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setCommenting((c) => !c)}>
          <MessageCircle size={21} color={colors.inkSoft} strokeWidth={2} />
        </Pressable>
      </Row>

      {m.comments.length > 0 && (
        <View style={styles.comments}>
          {m.comments.map((c) => (
            <Animated.View key={c.id} entering={FadeIn}>
              <Txt v="body" style={{ fontSize: 14, lineHeight: 20 }}>
                <Txt v="bodyStrong" style={{ fontSize: 14 }}>
                  {userName(c.createdBy)}：
                </Txt>
                {c.content}
              </Txt>
            </Animated.View>
          ))}
        </View>
      )}
      {commenting && (
        <Animated.View entering={FadeIn.duration(150)}>
          <Row style={styles.commentBox}>
            <TextInput autoFocus value={text} onChangeText={setText} placeholder="说点什么…" placeholderTextColor={colors.faint} style={styles.commentInput} onSubmitEditing={sendComment} returnKeyType="send" maxLength={500} />
            <IconButton icon={Send} size={34} bg={colors.ink} color={colors.white} onPress={sendComment} />
          </Row>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export default function Moments() {
  return (
    <Screen tab title="动态" subtitle="OUR LITTLE MOMENTS" onRefresh={async () => invalidate('moments')} right={<IconButton icon={Plus} onPress={() => router.push('/moment/new')} />}>
      <MomentPage queryKey={KEY} seen={[]} />
    </Screen>
  );
}

function MomentPage({ queryKey, seen }: { queryKey: string; seen: string[] }) {
  const moments = useQuery<Moment[]>(queryKey);
  const [next, setNext] = useState<string | null>(null);
  const rows = moments.data ?? [];
  const last = rows.at(-1);
  return (
    <View style={{ gap: 14 }}>
      {queryKey === KEY && moments.data && rows.length === 0 && (
        <Empty emoji="📷" title="发第一条动态吧" hint="只有你们两个人能看到，想发什么就发什么" action={<Button title="写点什么" onPress={() => router.push('/moment/new')} />} />
      )}
      {rows.filter((m) => !seen.includes(m.id)).map((m, i) => (
        <MomentCard key={m.id} m={m} i={i} queryKey={queryKey} />
      ))}
      {moments.loading && <Txt v="caption">正在加载动态…</Txt>}
      {moments.error && <Button title="加载失败，点此重试" variant="ghost" onPress={() => void moments.refresh()} />}
      {next ? <MomentPage queryKey={next} seen={[...seen, ...rows.map((m) => m.id)]} /> : last && rows.length === 30 ? (
        <Button title="查看更早的动态" variant="ghost" onPress={() => setNext(`${KEY}?before=${encodeURIComponent(`${last.createdAt}|${last.id}`)}`)} />
      ) : moments.data && (rows.length > 0 || queryKey !== KEY) && !moments.error ? <Txt v="caption" style={{ textAlign: 'center' }}>已经看到第一条动态了</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, borderCurve: 'continuous', ...shadow },
  bigHeart: { position: 'absolute', alignSelf: 'center', top: '30%' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.butter, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 },
  comments: { marginTop: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 12, gap: 6 },
  commentBox: { marginTop: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4, height: 42 },
  commentInput: { flex: 1, fontSize: 15, color: colors.ink, height: 42 },
});
