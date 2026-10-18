import { router } from 'expo-router';
import { ChevronRight, Dices, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { ReactNode, useEffect, useState } from 'react';
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

import { EmojiTile } from '@/components/EmojiTile';
import { Envelope } from '@/components/Envelope';
import { BlobCouple, FlatHeart } from '@/components/Mascot';
import { MediaThumb } from '@/components/Media';
import { RollingNumber, toast, useBurst } from '@/components/motion';
import { usePullRefresh } from '@/components/PullRefresh';
import { CENTERED } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TAB_BAR_HEIGHT } from '@/components/TabBar';
import { TodoRow } from '@/components/TodoRow';
import { AskSheet } from '@/components/AskSheet';
import { Avatar, Button, Card, enter, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { daysTogether, diffDays, fmtDate, greeting, parseDay, timeAgo, toDay, today } from '@/lib/dates';
import { upcomingEvents } from '@/lib/events';
import { haptic } from '@/lib/haptics';
import { MOODS, NUDGES } from '@/lib/nudge';
import { questionState } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Anniversary, Capsule, ChatUnread, GallerySummary, Moment, Place, Question, Todo } from '@/lib/types';
import { usePendingDeletes } from '@/lib/undo';
import { colors, fonts, radius, springs } from '@/theme';

/** 卡片标题：一个词说清楚是什么，右边是数量 / 箭头 */
function CardTitle({ children, right, color = colors.ink }: { children: ReactNode; right?: ReactNode; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <Txt v="bodyStrong" color={color}>
        {children}
      </Txt>
      {right ?? <ChevronRight size={18} color={colors.faint} />}
    </Row>
  );
}

// ---------------- 在一起天数
function HeroCard() {
  const { space, me, partner } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const n = daysTogether(space?.startDate);
  const next = upcomingEvents(anns.data, space?.startDate, false)[0];

  return (
    <PressScale onPress={() => router.push('/anniversaries')} style={styles.hero}>
      <View style={styles.heroBlobs} pointerEvents="none">
        <BlobCouple size={140} me={me} partner={partner} />
      </View>
      {space?.startDate ? (
        <>
          <Txt v="bodyStrong" color={colors.pinkInk} style={{ fontSize: 15 }}>
            在一起
          </Txt>
          <Row gap={6} style={{ alignItems: 'flex-end' }}>
            <RollingNumber value={n} style={{ fontFamily: fonts.displayBold, fontSize: 80, lineHeight: 88, color: colors.ink }} />
            <Txt v="heading" style={{ marginBottom: 16 }}>
              天
            </Txt>
          </Row>
          {next && (
            <View style={styles.heroPill}>
              <Txt v="secondary" color={colors.ink}>
                {next.title}
                <Txt v="secondary" color={colors.pinkInk}>
                  {next.daysLeft === 0 ? '  今天' : `  ${next.daysLeft} 天后`}
                </Txt>
              </Txt>
            </View>
          )}
        </>
      ) : (
        <View style={{ gap: 8, paddingVertical: 12 }}>
          <Txt v="title">设置在一起的日子</Txt>
          <Txt v="secondary" color={colors.pinkInk}>
            从第一天开始数
          </Txt>
        </View>
      )}
    </PressScale>
  );
}

// ---------------- 想你：会呼吸的爱心，点了冒爱心；右上角可以选别的
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
      toast(`已发送「${NUDGES[kind].text}」`, NUDGES[kind].emoji, undefined, { showEmoji: true });
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  return (
    <Card style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 164 }}>
      <Pressable onPress={() => send('miss')} onLongPress={() => (haptic.medium(), setMore(true))} delayLongPress={300} style={{ alignItems: 'center' }} accessibilityLabel={`想${partner?.name ?? 'TA'}了`}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {node}
          <Animated.View style={heart}>
            <FlatHeart size={60} />
          </Animated.View>
        </View>
        <Txt v="bodyStrong" style={{ marginTop: 10 }}>
          想{partner?.name ?? 'TA'}了
        </Txt>
      </Pressable>
      <Pressable hitSlop={10} onPress={() => (haptic.tick(), setMore(true))} style={styles.moreBtn} accessibilityLabel="更多">
        <MoreHorizontal size={18} color={colors.faint} />
      </Pressable>
      {more && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.nudgeMore}>
          {Object.entries(NUDGES)
            .filter(([k]) => k !== 'miss')
            .map(([k, n], i) => (
              <Animated.View key={k} entering={FadeInDown.delay(i * 40).springify().damping(14)}>
                <PressScale onPress={() => send(k)} style={styles.nudgeChip}>
                  <Text style={{ fontSize: 17 }}>{n.emoji}</Text>
                  <Txt v="secondary" color={colors.ink}>
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

// ---------------- 心情：上面是 TA 的，下面一颗小按钮是自己的
function MoodCard() {
  const { me, partner } = useCouple();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card onPress={() => setOpen(true)} style={{ flex: 1, minHeight: 164, justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Avatar user={partner} size={24} />
          <Txt v="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {partner?.name ?? 'TA'}
          </Txt>
          {partner?.moodAt && <Txt v="caption">{timeAgo(partner.moodAt)}</Txt>}
        </Row>
        <View>
          <Animated.Text key={partner?.mood} entering={FadeInDown.springify()} style={{ fontSize: 38 }}>
            {partner?.mood ?? '·'}
          </Animated.Text>
          <Txt v="bodyStrong" numberOfLines={1}>
            {partner?.moodText || (partner?.mood ? ' ' : '还没有心情')}
          </Txt>
        </View>
        <Row gap={6} style={styles.myMood}>
          <Text style={{ fontSize: 15 }}>{me?.mood ?? '+'}</Text>
          <Txt v="secondary" numberOfLines={1} style={{ flex: 1 }} color={colors.inkSoft}>
            {me?.mood ? me.moodText || '我的心情' : '我的心情'}
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
      <Txt v="heading">我现在的心情</Txt>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => (
          <PressScale key={m} scaleTo={0.85} onPress={() => setMood(m)} style={[styles.moodItem, mood === m && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Text style={{ fontSize: 28 }}>{m}</Text>
          </PressScale>
        ))}
        <EmojiTile value={mood} presets={MOODS} onChange={setMood} fontSize={28} style={styles.moodItem} activeStyle={{ backgroundColor: colors.accentSoft, borderColor: colors.accent }} />
      </View>
      <TextInput value={text} onChangeText={setText} placeholder="说一句" placeholderTextColor={colors.faint} maxLength={60} style={styles.moodInput} />
      <Button title="更新" onPress={save} />
    </>
  );
}

// ---------------- 接下来的日子
function UpcomingCard() {
  const { space } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const list = upcomingEvents(anns.data, space?.startDate).slice(0, 3);
  if (!list.length) return null;
  return (
    <Card onPress={() => router.push('/anniversaries')}>
      <CardTitle>接下来</CardTitle>
      {list.map((e, i) => (
        <Row key={e.key} style={[{ paddingVertical: 10 }, i > 0 && styles.rowSep]} gap={12}>
          <Text style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{e.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Txt v="body" numberOfLines={1}>
              {e.title}
            </Txt>
            <Txt v="caption">{fmtDate(toDay(e.date), true)}</Txt>
          </View>
          {e.daysLeft === 0 ? (
            <Txt v="bodyStrong" color={colors.accentStrong}>
              今天
            </Txt>
          ) : (
            <Row gap={3} style={{ alignItems: 'baseline' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: i === 0 ? 30 : 22, color: colors.ink }}>{e.daysLeft}</Text>
              <Txt v="caption">天</Txt>
            </Row>
          )}
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
  const go = () => (ready ? router.push({ pathname: '/capsule/[id]', params: { id: ready.id } }) : router.push(all.length ? '/capsules' : '/capsule/new'));

  return (
    <Card onPress={go} style={[{ flexDirection: 'row', alignItems: 'center', gap: 16 }, ready && { borderWidth: 1.5, borderColor: colors.accent }]}>
      <Envelope width={60} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {ready ? `「${ready.title}」可以打开了` : next ? '时光胶囊' : '写一封给未来的信'}
        </Txt>
        <Txt v="secondary">{ready ? '现在拆开' : next ? `${sealed.length} 封封存中 · ${days} 天后打开` : '到那天才能打开'}</Txt>
      </View>
      <ChevronRight size={18} color={colors.faint} />
    </Card>
  );
}

// ---------------- 问答
function QuestionCard() {
  const { me, partner } = useCouple();
  const questions = useQuery<Question[]>('/api/questions');
  const [asking, setAsking] = useState(false);
  const list = questions.data ?? [];
  const pending = list.filter((q) => questionState(q, me?.id).status === 'yours');
  const next = pending[0];
  const last = list[0];
  const name = partner?.name || 'TA';
  return (
    <>
      <Card bg={colors.peach} onPress={() => (next ? router.push({ pathname: '/question', params: { id: next.id } }) : setAsking(true))}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="secondary" color={colors.peachInk} style={{ fontWeight: '700' }}>
            问答
          </Txt>
          <Txt v="secondary" color={colors.peachInk} onPress={() => router.push('/questions')} suppressHighlighting>
            {pending.length > 1 ? `${pending.length} 个等你回答 ›` : '全部 ›'}
          </Txt>
        </Row>
        {next ? (
          <>
            <Row gap={10} style={{ alignItems: 'flex-start', marginTop: 10 }}>
              <Avatar user={next.createdBy === me?.id ? me : partner} size={30} />
              <View style={{ flex: 1 }}>
                <Txt v="caption" color={colors.peachInk}>
                  {next.createdBy === me?.id ? '你问的，也等你回答' : `${name}问你`}
                </Txt>
                <Text style={{ fontFamily: fonts.round, fontSize: 20, lineHeight: 28, color: colors.ink, marginTop: 2 }}>{next.text}</Text>
              </View>
            </Row>
            <Row gap={8} style={{ marginTop: 14 }}>
              <Button title="去回答" variant="accent" onPress={() => router.push({ pathname: '/question', params: { id: next.id } })} style={{ flex: 1, height: 44 }} />
              <Button title={`问${name}一个`} variant="ghost" onPress={() => setAsking(true)} style={styles.askGhost} />
            </Row>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: fonts.round, fontSize: 21, lineHeight: 30, color: colors.ink, marginTop: 6 }}>今天想问{name}点什么？</Text>
            <Txt v="secondary" color={colors.peachInk} numberOfLines={1} style={{ marginTop: 6 }}>
              {last ? `上一个问题：${last.text} · ${{ yours: '等你回答', waiting: '等 TA 回答', done: '都答了' }[questionState(last, me?.id).status]}` : '点这里，问 TA 第一个问题'}
            </Txt>
          </>
        )}
      </Card>
      <AskSheet visible={asking} onClose={() => setAsking(false)} />
    </>
  );
}

// ---------------- 美食
function EatsCard() {
  const places = useQuery<Place[]>('/api/places');
  const want = places.data?.filter((p) => p.status === 'want').length ?? 0;
  const visited = places.data?.filter((p) => p.status === 'visited').length ?? 0;
  return (
    <Card onPress={() => router.push('/eats')} style={{ flex: 1, minHeight: 140, justifyContent: 'space-between' }}>
      <Txt v="bodyStrong">美食</Txt>
      <View>
        <Row gap={4} style={{ alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 40, color: colors.ink, lineHeight: 46 }}>{visited}</Text>
          <Txt v="secondary">家吃过</Txt>
        </Row>
        <Txt v="secondary">{want} 家想去</Txt>
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
      style={{ flex: 1, minHeight: 140, justifyContent: 'space-between' }}>
      <Animated.View style={[{ alignSelf: 'flex-start' }, anim]}>
        <Dices size={34} color={colors.accent} strokeWidth={2} />
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
  return (
    <Card onPress={() => router.push('/todos')}>
      <CardTitle
        right={
          <Row gap={6}>
            {open.length > 0 && <Txt v="secondary">{open.length}</Txt>}
            <ChevronRight size={18} color={colors.faint} />
          </Row>
        }>
        清单
      </CardTitle>
      {open.length === 0 ? (
        <Txt v="secondary" style={{ paddingVertical: 6 }}>
          都做完了
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
  const author = userById(m.createdBy);
  return (
    <Card onPress={() => router.push('/moments')}>
      <CardTitle>动态</CardTitle>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt v="body" numberOfLines={3}>
            {m.mood ? `${m.mood} ` : ''}
            {m.content || (first ? (first.kind === 'video' ? '一段视频' : '照片') : '')}
          </Txt>
          <Row gap={6}>
            <Avatar user={author} size={20} />
            <Txt v="caption">
              {author?.name} · {timeAgo(m.createdAt)}
            </Txt>
          </Row>
        </View>
        {first && <MediaThumb item={first} size={72} radius={12} />}
      </Row>
    </Card>
  );
}

// ---------------- 相册里最新的几张
function RecentPhotos() {
  const summary = useQuery<GallerySummary>('/api/gallery/summary');
  const s = summary.data;
  if (!s?.latest.length) return null;
  return (
    <Card onPress={() => router.navigate('/gallery')}>
      <CardTitle
        right={
          <Row gap={6}>
            <Txt v="secondary">{s.total}</Txt>
            <ChevronRight size={18} color={colors.faint} />
          </Row>
        }>
        相册
      </CardTitle>
      <Row gap={6}>
        {s.latest.slice(0, 4).map((g) => (
          <View key={g.id} style={{ flex: 1 }}>
            <MediaThumb item={{ kind: g.kind, image: g.image, video: g.video, duration: g.duration }} size="100%" radius={10} />
          </View>
        ))}
        {Array.from({ length: Math.max(0, 4 - s.latest.length) }, (_, i) => (
          <View key={i} style={{ flex: 1 }} />
        ))}
      </Row>
    </Card>
  );
}

// ---------------- 聊天入口：有未读显示红点和数字
function ChatButton() {
  const unread = useQuery<ChatUnread>('/api/chat/unread');
  const n = unread.data?.count ?? 0;
  return (
    <PressScale scaleTo={0.9} onPress={() => router.push('/chat')} accessibilityLabel={n ? `聊天，${n} 条未读` : '聊天'} style={styles.chatBtn}>
      <MessageCircle size={20} color={colors.ink} strokeWidth={2.2} />
      {n > 0 && (
        <View style={styles.chatBadge}>
          <Text style={styles.chatBadgeText}>{n > 99 ? '99+' : n}</Text>
        </View>
      )}
    </PressScale>
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
    <QuestionCard key="q" />,
    <RecentPhotos key="photos" />,
    <LatestMoment key="moment" />,
    <Row key="r2" gap={12} style={{ alignItems: 'stretch' }}>
      <EatsCard />
      <RouletteCard />
    </Row>,
    <TodosCard key="todos" />,
    <CapsuleCard key="capsule" />,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 32, gap: 12 }, CENTERED]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        {...pullRefresh.touchProps}
        refreshControl={pullRefresh.refreshControl}>
        <Animated.View entering={enter(0)}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <View style={{ gap: 2 }}>
              <Txt v="secondary">{fmtDate(today(), true)}</Txt>
              <Txt v="title">
                {greeting()}，{me?.name ?? ''}
              </Txt>
            </View>
            <Row gap={10}>
              <ChatButton />
              <Pressable onPress={() => router.push('/settings')} accessibilityLabel="设置">
                <Row gap={0}>
                  <Avatar user={me} size={40} ring={colors.bg} />
                  <View style={{ marginLeft: -12 }}>
                    <Avatar user={partner} size={40} ring={colors.bg} />
                  </View>
                </Row>
              </Pressable>
            </Row>
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
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chatBadge: { position: 'absolute', top: -3, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  chatBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800', lineHeight: 12 },
  hero: { borderRadius: radius.xl, padding: 22, overflow: 'hidden', minHeight: 196, borderCurve: 'continuous', backgroundColor: colors.pink, justifyContent: 'center' },
  heroBlobs: { position: 'absolute', right: 4, bottom: -6 },
  heroPill: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  moreBtn: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  nudgeMore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.97)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
  },
  nudgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill },
  myMood: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dot: { width: 6, height: 6, borderRadius: 3 },
  askGhost: { height: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(153,87,58,0.3)' },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' },
  moodItem: { width: '15%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  moodInput: { backgroundColor: colors.surface, borderRadius: radius.md, height: 50, paddingHorizontal: 16, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: colors.line },
});
