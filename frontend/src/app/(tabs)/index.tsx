import { router } from 'expo-router';
import { ArrowUpRight, Dices, MessageCircleQuestion } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Envelope } from '@/components/Envelope';
import { MediaThumb } from '@/components/Media';
import { BlobCouple, FlatHeart } from '@/components/Mascot';
import { RollingNumber, toast, useBurst } from '@/components/motion';
import { usePullRefresh } from '@/components/PullRefresh';
import { Sheet } from '@/components/Sheet';
import { CENTERED } from '@/components/Screen';
import { TAB_BAR_HEIGHT } from '@/components/TabBar';
import { TodoRow } from '@/components/TodoRow';
import { Avatar, Button, Card, enter, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { daysTogether, diffDays, fmtDate, fmtFullDate, greeting, parseDay, timeAgo, toDay, today } from '@/lib/dates';
import { upcomingEvents } from '@/lib/events';
import { haptic } from '@/lib/haptics';
import { MOODS, NUDGES } from '@/lib/nudge';
import { questionOfDay } from '@/lib/questions';
import { usePendingDeletes } from '@/lib/undo';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Anniversary, Answer, Capsule, GallerySummary, Moment, Place, Todo } from '@/lib/types';
import { colors, fonts, radius, springs } from '@/theme';

// ---------------- 在一起天数大卡片
function HeroCard() {
  const { space, me, partner } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const n = daysTogether(space?.startDate);
  const next = upcomingEvents(anns.data, space?.startDate, false)[0];

  return (
    <PressScale onPress={() => router.push('/anniversaries')} style={styles.hero}>
      <View style={styles.heroBlobs} pointerEvents="none">
        <BlobCouple size={150} me={me} partner={partner} />
      </View>
      <Txt v="label" color={colors.pinkInk}>
        我们在一起
      </Txt>
      {space?.startDate ? (
        <>
          <Row gap={4} style={{ alignItems: 'flex-end', marginTop: 2 }}>
            <RollingNumber value={n} style={{ fontFamily: fonts.displayBold, fontSize: 76, lineHeight: 84, color: colors.ink }} />
            <Txt v="heading" style={{ marginBottom: 14 }}>
              天
            </Txt>
          </Row>
          <Txt v="caption" color={colors.pinkInk}>
            since {fmtFullDate(space.startDate)}
          </Txt>
          {next && (
            <View style={styles.heroPill}>
              <Txt v="caption" color={colors.ink} style={{ fontWeight: '700' }}>
                {next.emoji} {next.title} · {next.daysLeft === 0 ? '就是今天' : `${next.daysLeft} 天后`}
              </Txt>
            </View>
          )}
        </>
      ) : (
        <View style={{ marginTop: 12, gap: 6 }}>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 36, color: colors.ink }}>Day one?</Text>
          <Txt v="caption" color={colors.pinkInk}>
            点这里设置在一起的日子 →
          </Txt>
        </View>
      )}
    </PressScale>
  );
}

// ---------------- 想你按钮：会呼吸的爱心，点了冒爱心，长按选别的
function NudgeCard() {
  const { partner } = useCouple();
  const { fire, node } = useBurst();
  const [more, setMore] = useState(false);
  const beat = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    beat.set(withRepeat(withSequence(withTiming(1.08, { duration: 260 }), withTiming(1, { duration: 260 }), withTiming(1.05, { duration: 220 }), withTiming(1, { duration: 900 })), -1));
  }, [beat, reduceMotion]);
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  const send = async (kind: string) => {
    fire();
    haptic.medium();
    setMore(false);
    try {
      await api.post('/api/nudges', { kind });
      toast(`已发送「${NUDGES[kind].text}」`, NUDGES[kind].emoji, partner ? `${partner.name} 会立刻收到` : undefined);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  return (
    <Card style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 168 }}>
      <Pressable onPress={() => send('miss')} onLongPress={() => (haptic.medium(), setMore(true))} delayLongPress={300} style={{ alignItems: 'center' }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {node}
          <Animated.View style={heart}>
            <FlatHeart size={64} />
          </Animated.View>
        </View>
        <Txt v="bodyStrong" style={{ marginTop: 6 }}>
          想{partner?.name ?? 'TA'}了
        </Txt>
        <Txt v="caption" style={{ fontSize: 11 }}>
          点一下 · 长按更多
        </Txt>
      </Pressable>
      {more && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.nudgeMore}>
          {Object.entries(NUDGES)
            .filter(([k]) => k !== 'miss')
            .map(([k, n], i) => (
              <Animated.View key={k} entering={FadeInDown.delay(i * 40).springify().damping(14)}>
                <PressScale onPress={() => send(k)} style={styles.nudgeChip}>
                  <Text style={{ fontSize: 18 }}>{n.emoji}</Text>
                  <Txt v="caption" color={colors.ink} style={{ fontWeight: '600' }}>
                    {n.label}
                  </Txt>
                </PressScale>
              </Animated.View>
            ))}
          <Pressable onPress={() => setMore(false)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: -1 }} />
        </Animated.View>
      )}
    </Card>
  );
}

// ---------------- 心情
function MoodCard() {
  const { me, partner } = useCouple();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card onPress={() => setOpen(true)} style={{ flex: 1, minHeight: 168, justifyContent: 'space-between' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="label">TA 的心情</Txt>
          <Avatar user={partner} size={22} />
        </Row>
        <View>
          <Animated.Text key={partner?.mood} entering={FadeInDown.springify()} style={{ fontSize: 40 }}>
            {partner?.mood ?? '🫥'}
          </Animated.Text>
          <Txt v="bodyStrong" numberOfLines={2}>
            {partner?.moodText || (partner?.mood ? '' : '还没设置')}
          </Txt>
          {partner?.moodAt && <Txt v="caption">{timeAgo(partner.moodAt)}</Txt>}
        </View>
        <Row gap={6} style={styles.myMood}>
          <Txt v="caption">我：</Txt>
          <Text>{me?.mood ?? '＋'}</Text>
          <Txt v="caption" numberOfLines={1} style={{ flex: 1 }}>
            {me?.moodText ?? '更新心情'}
          </Txt>
        </Row>
      </Card>
      <MoodSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MoodSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // 每次打开都重新挂载，用当前心情做初始值
  const [session, setSession] = useState(0);
  const [prev, setPrev] = useState(visible);
  if (visible !== prev) {
    setPrev(visible);
    if (visible) setSession((n) => n + 1);
  }
  return (
    <Sheet visible={visible} onClose={onClose}>
      <MoodSheetBody key={session} onClose={onClose} />
    </Sheet>
  );
}

function MoodSheetBody({ onClose }: { onClose: () => void }) {
  const { me } = useCouple();
  const [mood, setMood] = useState(me?.mood ?? '🥰');
  const [text, setText] = useState(me?.moodText ?? '');
  const save = async () => {
    onClose();
    haptic.success();
    await api.patch('/api/me', { mood, moodText: text.trim() || null }).catch((e) => toast(e.message, '⚠️'));
    invalidate('me');
  };
  return (
    <>
      <Txt v="heading">现在的心情</Txt>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => (
          <PressScale key={m} scaleTo={0.85} onPress={() => setMood(m)} style={[styles.moodItem, mood === m && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Text style={{ fontSize: 28 }}>{m}</Text>
          </PressScale>
        ))}
      </View>
      <TextInput value={text} onChangeText={setText} placeholder="说一句（可选）" placeholderTextColor={colors.faint} maxLength={60} style={styles.moodInput} />
      <Button title="更新" onPress={save} />
    </>
  );
}

// ---------------- 下一个纪念日
function UpcomingCard() {
  const { space } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const list = upcomingEvents(anns.data, space?.startDate).slice(0, 3);
  const t = { ink: colors.pinkInk };
  return (
    <Card onPress={() => router.push('/anniversaries')}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Txt v="label" color={t.ink}>
          接下来
        </Txt>
        <ArrowUpRight size={18} color={t.ink} />
      </Row>
      {list.map((e, i) => (
        <Row key={e.key} style={{ paddingVertical: 7 }} gap={12}>
          <Text style={{ fontSize: 22 }}>{e.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" style={i === 0 ? { fontSize: 17 } : undefined}>
              {e.title}
            </Txt>
            <Txt v="caption" color={t.ink}>
              {fmtDate(toDay(e.date), true)}
              {e.sub ? ` · ${e.sub}` : ''}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {e.daysLeft === 0 ? (
              <Txt v="bodyStrong" color={t.ink}>
                今天 🎉
              </Txt>
            ) : (
              <Row gap={2} style={{ alignItems: 'baseline' }}>
                <Text style={{ fontFamily: fonts.display, fontSize: i === 0 ? 34 : 24, color: colors.ink }}>{e.daysLeft}</Text>
                <Txt v="caption" color={t.ink}>
                  天
                </Txt>
              </Row>
            )}
          </View>
        </Row>
      ))}
    </Card>
  );
}

// ---------------- 时光胶囊
function CapsuleCard() {
  const { me } = useCouple();
  const capsules = useQuery<Capsule[]>('/api/capsules');
  const all = capsules.data ?? [];
  const ready = all.find((c) => !c.locked && !c.openedBy.includes(me?.id ?? ''));
  const sealed = all.filter((c) => c.locked);
  const next = sealed[0];
  const days = next ? diffDays(parseDay(next.unlockAt), today()) : 0;
  const go = () =>
    ready ? router.push({ pathname: '/capsule/[id]', params: { id: ready.id } }) : router.push(all.length ? '/capsules' : '/capsule/new');

  return (
    <Card onPress={go} style={[{ flexDirection: 'row', alignItems: 'center', gap: 16 }, ready && { borderWidth: 1.5, borderColor: colors.accent }]}>
      <Envelope width={70} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="label" color={ready ? colors.accent : colors.muted}>
          时光胶囊
        </Txt>
        <Txt v="bodyStrong" numberOfLines={1}>
          {ready ? `「${ready.title}」可以打开了` : next ? `${sealed.length} 封信正在封存` : '给未来的你们写一封信'}
        </Txt>
        <Txt v="caption">{ready ? '轻点拆开 💌' : next ? `下一封还有 ${days} 天` : '选个日子封存，到那天才能打开'}</Txt>
      </View>
      <ArrowUpRight size={18} color={colors.muted} />
    </Card>
  );
}

// ---------------- 每日一问
function QuestionCard() {
  const { me } = useCouple();
  const day = toDay(today());
  const q = questionOfDay();
  const answers = useQuery<Answer[]>(`/api/answers?day=${day}`);
  const mine = answers.data?.find((a) => a.createdBy === me?.id);
  const theirs = answers.data?.find((a) => a.createdBy !== me?.id);
  const status = mine && theirs ? '都答完啦，点开看看 👀' : mine ? '等 TA 回答后揭晓' : theirs ? 'TA 已经回答了，轮到你' : '回答后才能看到对方的答案';
  return (
    <Card bg={colors.peach} onPress={() => router.push('/question')}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label" color={colors.peachInk}>
          每日一问
        </Txt>
        <MessageCircleQuestion size={18} color={colors.peachInk} />
      </Row>
      <Text style={{ fontFamily: fonts.round, fontSize: 22, lineHeight: 30, color: colors.ink, marginVertical: 10 }}>{q.text}</Text>
      <Txt v="caption" color={colors.peachInk} style={{ fontWeight: '600' }}>
        {status}
      </Txt>
    </Card>
  );
}

// ---------------- 美食
function EatsCard() {
  const places = useQuery<Place[]>('/api/places');
  const want = places.data?.filter((p) => p.status === 'want').length ?? 0;
  const visited = places.data?.filter((p) => p.status === 'visited').length ?? 0;
  const t = { ink: colors.peachInk };
  return (
    <Card onPress={() => router.push('/eats')} style={{ flex: 1, minHeight: 150, justifyContent: 'space-between' }}>
      <Txt v="label" color={t.ink}>
        美食地图
      </Txt>
      <View>
        <Row gap={4} style={{ alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 44, color: colors.ink, lineHeight: 48 }}>{visited}</Text>
          <Txt v="caption" color={t.ink}>
            家吃过
          </Txt>
        </Row>
        <Txt v="caption" color={t.ink}>
          还有 {want} 家想去
        </Txt>
      </View>
    </Card>
  );
}

function RouletteCard() {
  const spin = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Card
      onPress={() => {
        spin.set(withSpring(spin.value + 360, springs.bouncy));
        setTimeout(() => router.push('/roulette'), 200);
      }}
      style={{ flex: 1, minHeight: 150, justifyContent: 'space-between' }}>
      <Txt v="label" color={colors.pinkInk}>
        选择困难？
      </Txt>
      <Animated.View style={[{ alignSelf: 'flex-start' }, anim]}>
        <Dices size={36} color={colors.accent} strokeWidth={2.2} />
      </Animated.View>
      <Txt v="bodyStrong">今天吃什么</Txt>
    </Card>
  );
}

// ---------------- 清单
function TodosCard() {
  const todos = useQuery<Todo[]>('/api/todos');
  const hidden = usePendingDeletes();
  const open = todos.data?.filter((t) => !t.done && !hidden.has(t.id)) ?? [];
  const t = { ink: colors.muted };
  return (
    <Card onPress={() => router.push('/todos')}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <Txt v="label" color={t.ink}>
          我们的清单 · {open.length}
        </Txt>
        <ArrowUpRight size={18} color={t.ink} />
      </Row>
      {open.length === 0 ? (
        <Txt v="body" style={{ paddingVertical: 10 }}>
          全部完成，今天也很棒 ✨
        </Txt>
      ) : (
        open.slice(0, 3).map((todo) => <TodoRow key={todo.id} todo={todo} compact />)
      )}
    </Card>
  );
}

// ---------------- 最新动态
function LatestMoment() {
  const moments = useQuery<Moment[]>('/api/moments?limit=1');
  const hidden = usePendingDeletes();
  const { userById } = useCouple();
  const m = moments.data?.[0];
  if (!m || hidden.has(m.id)) return null;
  const first = m.media?.[0] ?? (m.photos[0] ? { kind: 'image' as const, image: m.photos[0] } : null);
  return (
    <Card onPress={() => router.push('/moments')}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Row>
          <Avatar user={userById(m.createdBy)} size={28} />
          <Txt v="caption">{timeAgo(m.createdAt)}</Txt>
        </Row>
        <Txt v="label">最新动态</Txt>
      </Row>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <Txt v="body" numberOfLines={3} style={{ flex: 1 }}>
          {m.mood ? `${m.mood} ` : ''}
          {m.content || (first ? (first.kind === 'video' ? '分享了一段视频' : '分享了照片') : '')}
        </Txt>
        {first && <MediaThumb item={first} size={64} radius={12} />}
      </Row>
    </Card>
  );
}

/** 共享相册里最新的几张 */
function RecentPhotos() {
  const summary = useQuery<GallerySummary>('/api/gallery/summary');
  const s = summary.data;
  if (!s?.latest.length) return null;
  return (
    <Card onPress={() => router.navigate('/gallery')}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt v="label" color={colors.pinkInk}>
          共享相册 · {s.total}
        </Txt>
        <ArrowUpRight size={18} color={colors.pinkInk} />
      </Row>
      <Row gap={6}>
        {s.latest.slice(0, 4).map((g) => (
          <View key={g.id} style={{ flex: 1 }}>
            <MediaThumb item={{ kind: g.kind, image: g.image, video: g.video, duration: g.duration }} size="100%" radius={12} />
          </View>
        ))}
        {Array.from({ length: Math.max(0, 4 - s.latest.length) }, (_, i) => (
          <View key={i} style={{ flex: 1 }} />
        ))}
      </Row>
    </Card>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { me, partner } = useCouple();

  const refresh = () => Promise.all(['me', 'space', 'anniversaries', 'places', 'todos', 'moments', 'answers', 'capsules', 'gallery'].map(invalidate));
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  const pullRefresh = usePullRefresh(refresh, y, insets.top + 8);

  const blocks = [
    <HeroCard key="hero" />,
    <Row key="r1" gap={12} style={{ alignItems: 'stretch' }}>
      <NudgeCard />
      <MoodCard />
    </Row>,
    <UpcomingCard key="up" />,
    <CapsuleCard key="capsule" />,
    <QuestionCard key="q" />,
    <Row key="r2" gap={12} style={{ alignItems: 'stretch' }}>
      <EatsCard />
      <RouletteCard />
    </Row>,
    <TodosCard key="todos" />,
    <LatestMoment key="moment" />,
    <RecentPhotos key="photos" />,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 32, gap: 12 }, CENTERED]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        {...pullRefresh.touchProps}
        refreshControl={pullRefresh.refreshControl}>
        <Animated.View entering={enter(0)}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <View>
              <Txt v="label">{fmtDate(today(), true)}</Txt>
              <Txt v="title">
                {greeting()}，{me?.name ?? ''}
              </Txt>
            </View>
            <Pressable onPress={() => router.push('/settings')}>
              <Row gap={0}>
                <Avatar user={me} size={40} ring={colors.bg} />
                <View style={{ marginLeft: -12 }}>
                  <Avatar user={partner} size={40} ring={colors.bg} />
                </View>
              </Row>
            </Pressable>
          </Row>
        </Animated.View>
        {blocks.map((b, i) => (
          <Animated.View key={i} entering={enter(i + 1)}>
            {b}
          </Animated.View>
        ))}
      </Animated.ScrollView>
      {pullRefresh.indicator}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22, paddingBottom: 20, overflow: 'hidden', minHeight: 200, borderCurve: 'continuous', backgroundColor: colors.pink },
  heroBlobs: { position: 'absolute', right: 6, bottom: -4 },
  heroPill: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  nudgeMore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(253,227,223,0.96)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
  },
  nudgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill },
  myMood: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' },
  moodItem: { width: '15%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  moodInput: { backgroundColor: colors.surface, borderRadius: radius.md, height: 50, paddingHorizontal: 16, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: colors.line },
});
