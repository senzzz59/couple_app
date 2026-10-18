import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Settings2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DatePicker } from '@/components/DatePicker';
import { toast } from '@/components/motion';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TimeField } from '@/components/TimeField';
import { Avatar, Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { parseDay, toDay } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { TODO_CATEGORIES } from '@/lib/nudge';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Todo } from '@/lib/types';
import { colors, radius } from '@/theme';

// 常用时间，点一下就选上；其它时间点「自定义」
const TIMES = ['09:00', '12:00', '18:00', '21:00'];
type Settings = { todoCategories?: string[] };

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
  const settings = useQuery<Settings>('/api/settings');
  const categories = settings.data?.todoCategories ?? TODO_CATEGORIES;
  // 这条待办原来的分类后来被删掉了，也照样显示出来
  const shownCategories = category && !categories.includes(category) ? [...categories, category] : categories;
  const [managing, setManaging] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const saveCategories = async (next: string[]) => {
    setCategorySaving(true);
    try {
      const res = await api.put<Settings>('/api/settings/todoCategories', { value: next });
      setQueryData<Settings>('/api/settings', (prev) => ({ ...prev, ...res }));
      return true;
    } catch (e) {
      toast((e as Error).message, '⚠️');
      return false;
    } finally {
      setCategorySaving(false);
    }
  };
  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name || categorySaving) return;
    if (categories.includes(name)) return toast('这个分类已经有了', '🗂️');
    if (await saveCategories([...categories, name])) {
      setNewCategory('');
      setCategory(name);
    }
  };

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
        <Row style={{ justifyContent: 'space-between', marginHorizontal: 4 }}>
          <Txt v="label">分类</Txt>
          <PressScale scaleTo={0.93} hitSlop={8} onPress={() => setManaging(true)} accessibilityLabel="管理分类" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Settings2 size={13} color={colors.accentStrong} />
            <Txt v="caption" color={colors.accentStrong} style={{ fontWeight: '600' }}>
              管理
            </Txt>
          </PressScale>
        </Row>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {shownCategories.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
          ))}
        </Row>
      </View>

      <Sheet visible={managing} onClose={() => setManaging(false)} dragAnywhere={false} style={{ gap: 14 }}>
        <Txt v="heading">待办分类</Txt>
        <Txt v="caption">两个人共用。删掉分类不会影响已经有的待办。</Txt>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <View key={c} style={{ flexDirection: 'row', alignItems: 'center', height: 34, paddingLeft: 14, paddingRight: 6, gap: 2, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
                <Txt v="secondary" style={{ fontWeight: '600' }}>
                  {c}
                </Txt>
                <PressScale accessibilityLabel={`删除分类${c}`} disabled={categorySaving} onPress={() => saveCategories(categories.filter((x) => x !== c))} style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                  <X size={14} color={colors.muted} />
                </PressScale>
              </View>
            ))}
            {!categories.length && <Txt v="caption">还没有分类，加一个吧</Txt>}
          </Row>
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <Field value={newCategory} onChangeText={setNewCategory} maxLength={10} placeholder="新分类，例如：家务" onSubmitEditing={addCategory} />
            </View>
            <Button title="添加" icon={Plus} onPress={addCategory} loading={categorySaving} disabled={!newCategory.trim()} />
          </Row>
        </ScrollView>
      </Sheet>

      <View style={{ gap: 10 }}>
        <DatePicker label="提醒时间（可选）" value={dueDay} onChange={setDueDay} />
        {dueDay && (
          <Animated.View entering={FadeInDown.springify()}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {TIMES.map((t) => (
                <Chip key={t} label={t} active={dueTime === t} onPress={() => setDueTime(t)} />
              ))}
              <TimeField value={dueTime} active={!TIMES.includes(dueTime)} onChange={setDueTime} />
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
