import { router } from 'expo-router';
import { ArrowUp, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, ZoomIn } from 'react-native-reanimated';

import { Segmented, toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { QueryFallback } from '@/components/Skeleton';
import { TodoRow } from '@/components/TodoRow';
import { Chip, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { undoable, usePendingDeletes } from '@/lib/undo';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Todo } from '@/lib/types';
import { colors, radius, sectionTheme, shadow, springs } from '@/theme';

function Progress({ done, total }: { done: number; total: number }) {
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(total ? done / total : 0, springs.soft);
  }, [done, total, p]);
  const bar = useAnimatedStyle(() => ({ width: p.value * w }));
  return (
    <View style={styles.progressCard}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <Txt v="bodyStrong" color={sectionTheme.todos.ink}>
          完成 {done} / {total}
        </Txt>
        <Txt v="caption" color={sectionTheme.todos.ink}>
          {total && done === total ? '全部搞定 🎉' : `还剩 ${total - done} 件`}
        </Txt>
      </Row>
      <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
    </View>
  );
}

function SwipeRow({ todo }: { todo: Todo }) {
  const remove = () => {
    let index = 0;
    undoable({
      id: todo.id,
      message: `删掉了「${todo.title.length > 12 ? `${todo.title.slice(0, 12)}…` : todo.title}」`,
      apply: () =>
        setQueryData<Todo[]>('/api/todos', (prev = []) => {
          index = Math.max(0, prev.findIndex((t) => t.id === todo.id));
          return prev.filter((t) => t.id !== todo.id);
        }),
      revert: () =>
        setQueryData<Todo[]>('/api/todos', (prev = []) => (prev.some((t) => t.id === todo.id) ? prev : [...prev.slice(0, index), todo, ...prev.slice(index)])),
      commit: async () => {
        await api.del(`/api/todos/${todo.id}`);
        await invalidate('todos');
      },
    });
  };
  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={60}
      overshootRight={false}
      renderRightActions={() => (
        <PressScale onPress={remove} style={styles.delete}>
          <Trash2 size={20} color={colors.white} />
        </PressScale>
      )}>
      <View style={{ backgroundColor: colors.surface, paddingHorizontal: 16 }}>
        <TodoRow todo={todo} onPress={() => router.push({ pathname: '/todo/new', params: { id: todo.id } })} />
      </View>
    </ReanimatedSwipeable>
  );
}

export default function Todos() {
  const todos = useQuery<Todo[]>('/api/todos');
  const hidden = usePendingDeletes();
  const { me, partner } = useCouple();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [who, setWho] = useState<'all' | 'me' | 'partner'>('all');
  const [title, setTitle] = useState('');

  const filtered = useMemo(
    () => (todos.data ?? []).filter((t) => !hidden.has(t.id) && (who === 'all' ? true : who === 'me' ? t.assigneeId === me?.id : t.assigneeId === partner?.id)),
    [todos.data, who, me?.id, partner?.id, hidden]
  );
  const list = filtered.filter((t) => (tab === 'open' ? !t.done : t.done));
  const done = filtered.filter((t) => t.done).length;

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    haptic.success();
    const optimistic = { id: `tmp-${Date.now()}`, title: t, done: false, assigneeId: who === 'me' ? me?.id : who === 'partner' ? partner?.id : null } as Todo;
    setQueryData<Todo[]>('/api/todos', (prev = []) => [optimistic, ...prev]);
    await api.post('/api/todos', { title: t, assigneeId: optimistic.assigneeId }).catch((e) => toast(e.message, '⚠️'));
    invalidate('todos');
  };

  return (
    <Screen tab title="清单" subtitle="THINGS TO DO TOGETHER" onRefresh={async () => invalidate('todos')}>
      <Animated.View entering={enter(0)} style={styles.addBar}>
        <TextInput value={title} onChangeText={setTitle} placeholder="加一件要一起做的事…" placeholderTextColor={colors.faint} style={styles.addInput} onSubmitEditing={add} returnKeyType="done" blurOnSubmit={false} />
        {title.trim() ? (
          <Animated.View entering={ZoomIn.springify().damping(14)}>
            <IconButton icon={ArrowUp} size={38} bg={colors.ink} color={colors.white} onPress={add} />
          </Animated.View>
        ) : (
          <IconButton icon={SlidersHorizontal} size={38} bg={colors.surfaceAlt} onPress={() => router.push('/todo/new')} />
        )}
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <Progress done={done} total={filtered.length} />
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label="全部" active={who === 'all'} onPress={() => setWho('all')} />
          <Chip label={`我的`} active={who === 'me'} onPress={() => setWho('me')} />
          <Chip label={`${partner?.name ?? 'TA'} 的`} active={who === 'partner'} onPress={() => setWho('partner')} />
        </ScrollView>
        <Segmented
          options={[
            { key: 'open', label: '待完成' },
            { key: 'done', label: '已完成' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Animated.View>

      <View style={{ marginTop: 14 }}>
        <QueryFallback q={todos} kind="row" count={4} />
        {!todos.data ? null : list.length === 0 ? (
          <Empty emoji={tab === 'open' ? '🌿' : '📝'} title={tab === 'open' ? '没有待办啦' : '还没有完成的事'} hint={tab === 'open' ? '去约会吧，或者在上面加一件新的事' : undefined} />
        ) : (
          <View style={styles.listCard}>
            {list.map((t, i) => (
              <Animated.View key={t.id} entering={enter(i)} exiting={FadeOut.duration(180)} layout={LinearTransition.springify().damping(18)}>
                {i > 0 && <View style={styles.sep} />}
                <SwipeRow todo={t} />
              </Animated.View>
            ))}
          </View>
        )}
        {list.length > 0 && (
          <Txt v="caption" style={{ textAlign: 'center', marginTop: 12, color: colors.faint }}>
            左滑删除 · 点击编辑
          </Txt>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, paddingLeft: 18, paddingRight: 6, height: 52, marginBottom: 12, ...shadow },
  addInput: { flex: 1, fontSize: 16, color: colors.ink, height: 52 },
  progressCard: { backgroundColor: sectionTheme.todos.bg, borderRadius: radius.lg, padding: 16, marginBottom: 14 },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.6)', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 52 },
  delete: { width: 76, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
