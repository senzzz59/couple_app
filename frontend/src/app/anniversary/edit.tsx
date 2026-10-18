import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { DatePicker } from '@/components/DatePicker';
import { EmojiTile } from '@/components/EmojiTile';
import { TimeField } from '@/components/TimeField';
import { Segmented, toast } from '@/components/motion';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { DEFAULT_REMINDER_TIME } from '@/lib/reminderPlans';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Anniversary } from '@/lib/types';
import { useKept } from '@/lib/useKept';
import { colors, radius } from '@/theme';

const EMOJIS = ['💞', '🎂', '🎁', '💍', '✈️', '🏠', '🐱', '🌹', '🎬', '🍰', '🌙', '⭐️'];
const REMINDS = [
  { d: 0, label: '当天' },
  { d: 1, label: '提前 1 天' },
  { d: 3, label: '提前 3 天' },
  { d: 7, label: '提前 1 周' },
];
// 和服务器的限制一致
const MAX_REMINDS = 5;
const MAX_DAYS = 60;
const remindLabel = (d: number) => REMINDS.find((r) => r.d === d)?.label ?? `提前 ${d} 天`;
const REMIND_TIMES = ['09:00', '12:00', '20:00'];
type Settings = { reminderTime?: string };

export default function EditAnniversary() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useQuery<Anniversary>(id ? `/api/anniversaries/${id}` : null);
  if (id && !existing.data) return <SheetLoading title="编辑纪念日" q={existing} />;
  return <AnniversaryForm id={id} initial={existing.data} />;
}

function AnniversaryForm({ id, initial: a }: { id?: string; initial?: Anniversary }) {
  const [title, setTitle] = useKept(`anniversary:${id ?? 'new'}:title`, a?.title ?? '');
  const [emoji, setEmoji] = useKept(`anniversary:${id ?? 'new'}:emoji`, a?.emoji ?? '💞');
  const [kind, setKind] = useKept<Anniversary['kind']>(`anniversary:${id ?? 'new'}:kind`, a?.kind ?? 'custom');
  const [date, setDate] = useKept<string | null>(`anniversary:${id ?? 'new'}:date`, a?.date ?? null);
  const [lunar, setLunar] = useKept(`anniversary:${id ?? 'new'}:lunar`, a?.lunar ?? false);
  const [yearly, setYearly] = useKept(`anniversary:${id ?? 'new'}:yearly`, a?.yearly ?? true);
  const [remind, setRemind] = useKept<number[]>(`anniversary:${id ?? 'new'}:remind`, a?.remind ?? [0, 1]);
  const [saving, setSaving] = useState(false);
  const [customDays, setCustomDays] = useKept(`anniversary:${id ?? 'new'}:customDays`, '');
  const settings = useQuery<Settings>('/api/settings');
  const remindTime = settings.data?.reminderTime ?? DEFAULT_REMINDER_TIME;
  // 提醒时间是所有纪念日共用的设置，改了立刻保存
  const setRemindTime = async (value: string) => {
    if (value === remindTime) return;
    setQueryData<Settings>('/api/settings', (prev) => ({ ...prev, reminderTime: value }));
    try {
      await api.put('/api/settings/reminderTime', { value });
    } catch (e) {
      toast((e as Error).message, '⚠️');
      invalidate('settings');
    }
  };
  const toggleRemind = (d: number) => {
    if (remind.includes(d)) return setRemind(remind.filter((x) => x !== d));
    if (remind.length >= MAX_REMINDS) return toast(`最多 ${MAX_REMINDS} 个提醒`, '⏰');
    setRemind([...remind, d].sort((a, b) => a - b));
  };
  const addCustomDays = () => {
    const d = Number(customDays);
    if (!Number.isInteger(d) || d < 0 || d > MAX_DAYS) return toast(`填 0 到 ${MAX_DAYS} 之间的天数`, '⏰');
    setCustomDays('');
    if (!remind.includes(d)) toggleRemind(d);
  };

  const save = async () => {
    if (!title.trim() || !date) return toast('名字和日期都要填');
    setSaving(true);
    const body = { title: title.trim(), emoji, kind, date, lunar, yearly, remind };
    try {
      if (id) await api.patch(`/api/anniversaries/${id}`, body);
      else await api.post('/api/anniversaries', body);
      haptic.success();
      invalidate('anniversaries');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScreen title={id ? '编辑纪念日' : '新纪念日'} action={<Button title="保存" onPress={save} loading={saving} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {EMOJIS.map((e) => (
          <PressScale key={e} scaleTo={0.85} onPress={() => setEmoji(e)} style={{ width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? colors.lilac : colors.surface }}>
            <Text style={{ fontSize: 26 }}>{e}</Text>
          </PressScale>
        ))}
        <EmojiTile value={emoji} presets={EMOJIS} onChange={setEmoji} size={50} fontSize={26} style={{ borderRadius: radius.md, backgroundColor: colors.surface }} activeStyle={{ backgroundColor: colors.lilac }} />
      </ScrollView>
      <Field label="名字" value={title} onChangeText={setTitle} placeholder="例如：第一次约会" />
      <Segmented
        options={[
          { key: 'love', label: '恋爱' },
          { key: 'birthday', label: '生日' },
          { key: 'custom', label: '其他' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (k === 'birthday') setEmoji('🎂');
        }}
      />
      <DatePicker label="日期" value={date} onChange={setDate} showLunar />
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line }}>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
          <View>
            <Txt v="body">按农历过</Txt>
          </View>
          <Switch value={lunar} onValueChange={setLunar} trackColor={{ true: colors.lilacInk }} />
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Txt v="body">每年重复</Txt>
          <Switch value={yearly} onValueChange={setYearly} trackColor={{ true: colors.lilacInk }} />
        </Row>
      </View>
      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          提醒
        </Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {[...new Set([...REMINDS.map((r) => r.d), ...remind])].sort((a, b) => a - b).map((d) => (
            <Chip key={d} label={remindLabel(d)} active={remind.includes(d)} onPress={() => toggleRemind(d)} />
          ))}
        </Row>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <Txt v="secondary">自定义：提前</Txt>
          <TextInput
            value={customDays}
            onChangeText={(t) => setCustomDays(t.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder="天数"
            placeholderTextColor={colors.faint}
            onSubmitEditing={addCustomDays}
            accessibilityLabel="提前几天提醒"
            style={{ width: 64, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, textAlign: 'center', fontSize: 16, color: colors.ink }}
          />
          <Txt v="secondary">天</Txt>
          <Chip label="添加" onPress={addCustomDays} />
        </Row>
        <Txt v="label" style={{ marginLeft: 4, marginTop: 8 }}>
          提醒时间
        </Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {REMIND_TIMES.map((t) => (
            <Chip key={t} label={t} active={remindTime === t} onPress={() => setRemindTime(t)} />
          ))}
          <TimeField value={remindTime} active={!REMIND_TIMES.includes(remindTime)} onChange={setRemindTime} />
        </Row>
      </View>
      {id && (
        <Button
          title="删除"
          variant="ghost"
          onPress={async () => {
            if (!(await confirm('删除这个纪念日？', ''))) return;
            await api.del(`/api/anniversaries/${id}`);
            invalidate('anniversaries');
            router.back();
          }}
        />
      )}
    </SheetScreen>
  );
}
