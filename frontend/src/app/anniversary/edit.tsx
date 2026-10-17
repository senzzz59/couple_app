import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { DatePicker } from '@/components/DatePicker';
import { Segmented, toast } from '@/components/motion';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { invalidate, useQuery } from '@/lib/store';
import type { Anniversary } from '@/lib/types';
import { colors, radius } from '@/theme';

const EMOJIS = ['💞', '🎂', '🎁', '💍', '✈️', '🏠', '🐱', '🌹', '🎬', '🍰', '🌙', '⭐️'];
const REMINDS = [
  { d: 0, label: '当天' },
  { d: 1, label: '提前 1 天' },
  { d: 3, label: '提前 3 天' },
  { d: 7, label: '提前 1 周' },
];

export default function EditAnniversary() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useQuery<Anniversary>(id ? `/api/anniversaries/${id}` : null);
  if (id && !existing.data) return <SheetLoading title="编辑纪念日" q={existing} />;
  return <AnniversaryForm id={id} initial={existing.data} />;
}

function AnniversaryForm({ id, initial: a }: { id?: string; initial?: Anniversary }) {
  const [title, setTitle] = useState(a?.title ?? '');
  const [emoji, setEmoji] = useState(a?.emoji ?? '💞');
  const [kind, setKind] = useState<Anniversary['kind']>(a?.kind ?? 'custom');
  const [date, setDate] = useState<string | null>(a?.date ?? null);
  const [lunar, setLunar] = useState(a?.lunar ?? false);
  const [yearly, setYearly] = useState(a?.yearly ?? true);
  const [remind, setRemind] = useState<number[]>(a?.remind ?? [0, 1]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !date) return toast('名字和日期都要填哦', '✏️');
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
            <Txt v="caption">长辈的生日、七夕这类</Txt>
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
          提醒（上午 9 点）
        </Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {REMINDS.map((r) => (
            <Chip key={r.d} label={r.label} active={remind.includes(r.d)} color={colors.lilacInk} onPress={() => setRemind(remind.includes(r.d) ? remind.filter((x) => x !== r.d) : [...remind, r.d].sort())} />
          ))}
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
