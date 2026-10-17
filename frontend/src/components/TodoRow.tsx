import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';

import { api } from '@/lib/api';
import { fmtDate, toDay } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData } from '@/lib/store';
import type { Todo } from '@/lib/types';
import { colors, springs } from '@/theme';

import { celebrate, toast } from './motion';
import { Avatar, Row, Txt } from './ui';

/** 勾选后先让勾和删除线动画播完，再更新列表（否则条目会瞬间消失） */
export async function toggleTodo(t: Todo, delay = 0) {
  const done = !t.done;
  if (done) haptic.success();
  else haptic.tap();
  if (delay) await new Promise((r) => setTimeout(r, delay));
  let allDone = false;
  setQueryData<Todo[]>('/api/todos', (prev = []) => {
    const next = prev.map((x) => (x.id === t.id ? { ...x, done, doneAt: done ? new Date().toISOString() : null } : x));
    allDone = done && next.every((x) => x.done);
    return next;
  });
  if (allDone) setTimeout(celebrate, 250);
  try {
    await api.patch(`/api/todos/${t.id}`, { done });
  } catch (e) {
    toast((e as Error).message, '⚠️');
  }
  invalidate('todos');
}

function dueLabel(due: string) {
  const d = new Date(due);
  const day = toDay(d);
  const todayStr = toDay(new Date());
  const tomorrow = toDay(new Date(Date.now() + 864e5));
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dayLabel = day === todayStr ? '今天' : day === tomorrow ? '明天' : fmtDate(day);
  return { text: `${dayLabel} ${time}`, overdue: d.getTime() < Date.now() };
}

export function TodoRow({ todo, onPress, compact }: { todo: Todo; onPress?: () => void; compact?: boolean }) {
  const { userById } = useCouple();
  const [w, setW] = useState(0);
  // 本地先勾上（动画立刻播放），服务器数据回来后跟随 props
  const [done, setDone] = useState(todo.done);
  const [synced, setSynced] = useState(todo.done);
  if (todo.done !== synced) {
    setSynced(todo.done);
    setDone(todo.done);
  }
  const strike = useSharedValue(todo.done ? 1 : 0);
  const box = useSharedValue(1);

  useEffect(() => {
    strike.value = withTiming(done ? 1 : 0, { duration: 260 });
    if (done) box.value = withSequence(withTiming(0.75, { duration: 80 }), withSpring(1, springs.bouncy));
  }, [done, strike, box]);

  const line = useAnimatedStyle(() => ({ width: strike.value * w }));
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: box.value }] }));
  const assignee = userById(todo.assigneeId);
  const due = todo.due && !done ? dueLabel(todo.due) : null;

  return (
    <Pressable onPress={onPress} style={[styles.row, compact && { paddingVertical: 8 }]}>
      <Pressable hitSlop={10} onPress={() => {
          setDone(!done);
          toggleTodo(todo, done ? 0 : 650);
        }}>
        <Animated.View style={[styles.box, done && styles.boxDone, boxStyle]}>
          {done && (
            <Animated.View entering={ZoomIn.springify().damping(12)}>
              <Check size={14} color={colors.white} strokeWidth={3.5} />
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignSelf: 'flex-start' }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
          <Txt v="body" color={done ? colors.muted : colors.ink} numberOfLines={compact ? 1 : 3}>
            {todo.title}
          </Txt>
          <Animated.View style={[styles.strike, line]} />
        </View>
        {!compact && (due || todo.category) && (
          <Row gap={8}>
            {due && (
              <Txt v="caption" color={due.overdue ? colors.accent : colors.muted}>
                {due.text}
              </Txt>
            )}
            {todo.category && <Txt v="caption">#{todo.category}</Txt>}
          </Row>
        )}
      </View>
      {assignee && <Avatar user={assignee} size={compact ? 22 : 26} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  strike: { position: 'absolute', height: 1.5, backgroundColor: colors.muted, top: '52%', left: 0 },
});
