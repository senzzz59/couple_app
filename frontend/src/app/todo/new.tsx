import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DatePicker } from '@/components/DatePicker';
import { toast } from '@/components/motion';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Avatar, Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { parseDay, toDay } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { TODO_CATEGORIES } from '@/lib/nudge';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Todo } from '@/lib/types';
import { colors, radius } from '@/theme';

const TIMES = ['09:00', '12:00', '18:00', '21:00'];

export default function EditTodo() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useQuery<Todo>(id ? `/api/todos/${id}` : null);
  if (id && !existing.data) return <SheetLoading title="编辑待办" q={existing} />;
  return <TodoForm id={id} initial={existing.data} />;
}

function TodoForm({ id, initial: t }: { id?: string; initial?: Todo }) {
  const { me, partner } = useCouple();
  const due0 = t?.due ? new Date(t.due) : null;
  const [title, setTitle] = useState(t?.title ?? '');
  const [note, setNote] = useState(t?.note ?? '');
  const [category, setCategory] = useState<string | null>(t?.category ?? null);
  const [assignee, setAssignee] = useState<string | null>(t?.assigneeId ?? null);
  const [dueDay, setDueDay] = useState<string | null>(due0 ? toDay(due0) : null);
  const [dueTime, setDueTime] = useState(due0 ? `${String(due0.getHours()).padStart(2, '0')}:${String(due0.getMinutes()).padStart(2, '0')}` : '09:00');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast('写一下要做什么', '✏️');
    setSaving(true);
    let due: string | null = null;
    if (dueDay) {
      const d = parseDay(dueDay);
      const [h, m] = dueTime.split(':').map(Number);
      d.setHours(h, m);
      due = d.toISOString();
    }
    const body = { title: title.trim(), note: note.trim() || null, category, assigneeId: assignee, due };
    try {
      if (id) await api.patch(`/api/todos/${id}`, body);
      else await api.post('/api/todos', body);
      haptic.success();
      invalidate('todos');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  const people = [
    { id: null, label: '一起' },
    { id: me?.id ?? null, label: me?.name ?? '我', user: me },
    { id: partner?.id ?? null, label: partner?.name ?? 'TA', user: partner },
  ].filter((p, i) => i === 0 || p.id);

  return (
    <SheetScreen title={id ? '编辑待办' : '新待办'} action={<Button title="保存" onPress={save} loading={saving} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <Field autoFocus={!id} label="要做什么" value={title} onChangeText={setTitle} placeholder="例如：订周六的电影票" />

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          谁来做
        </Txt>
        <Row gap={10}>
          {people.map((p) => {
            const active = assignee === p.id;
            return (
              <PressScale
                key={p.label}
                onPress={() => setAssignee(p.id)}
                style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md, backgroundColor: active ? colors.ink : colors.surface, borderWidth: 1, borderColor: active ? colors.ink : colors.line }}>
                {p.user ? <Avatar user={p.user} size={30} /> : <Txt style={{ fontSize: 22 }}>👫</Txt>}
                <Txt v="caption" color={active ? colors.white : colors.inkSoft} style={{ fontWeight: '600' }}>
                  {p.label}
                </Txt>
              </PressScale>
            );
          })}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          分类
        </Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {TODO_CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 10 }}>
        <DatePicker label="提醒时间（可选）" value={dueDay} onChange={setDueDay} />
        {dueDay && (
          <Animated.View entering={FadeInDown.springify()}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {TIMES.map((t) => (
                <Chip key={t} label={t} active={dueTime === t} onPress={() => setDueTime(t)} />
              ))}
              <Chip label="不提醒" onPress={() => setDueDay(null)} />
            </Row>
          </Animated.View>
        )}
      </View>

      <Field label="备注" value={note} onChangeText={setNote} placeholder="补充说明" multiline />
      {id && (
        <Button
          title="删除"
          variant="ghost"
          onPress={async () => {
            if (!(await confirm('删除这个待办？', ''))) return;
            await api.del(`/api/todos/${id}`);
            invalidate('todos');
            router.back();
          }}
        />
      )}
    </SheetScreen>
  );
}
