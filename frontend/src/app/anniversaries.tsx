import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DatePicker } from '@/components/DatePicker';
import { RollingNumber, toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Card, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { daysTogether, diffDays, fmtDate, fmtFullDate, lunarLabel, parseDay, toDay, today } from '@/lib/dates';
import { upcomingEvents } from '@/lib/events';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Anniversary } from '@/lib/types';
import { colors, fonts, radius, sectionTheme } from '@/theme';

export default function Anniversaries() {
  const { space } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const [editingStart, setEditingStart] = useState(false);
  const events = upcomingEvents(anns.data, space?.startDate).slice(0, 8);
  const t = sectionTheme.days;

  const setStart = async (d: string) => {
    haptic.success();
    setEditingStart(false);
    await api.patch('/api/space', { startDate: d }).catch((e) => toast(e.message, '⚠️'));
    invalidate('space');
  };

  return (
    <Screen back title="纪念日" subtitle="DAYS THAT MATTER" right={<IconButton icon={Plus} onPress={() => router.push('/anniversary/edit')} />}>
      <Animated.View entering={enter(0)}>
        <Card bg={colors.pink} style={{ padding: 22 }}>
          <Txt v="label" color={colors.pinkInk}>
            我们已经在一起
          </Txt>
          <Row gap={8} style={{ alignItems: 'flex-end' }}>
            <RollingNumber value={daysTogether(space?.startDate)} style={{ fontFamily: fonts.displayBold, fontSize: 72, lineHeight: 80, color: colors.ink }} />
            <Txt v="heading" style={{ marginBottom: 14 }}>
              天
            </Txt>
          </Row>
          <PressScale haptics={false} onPress={() => setEditingStart((e) => !e)}>
            <Txt v="caption" color={colors.pinkInk}>
              {space?.startDate ? `${fmtFullDate(space.startDate)} 开始 · 点击修改` : '点击设置在一起的日子'}
            </Txt>
          </PressScale>
        </Card>
        {editingStart && (
          <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 10 }}>
            <DatePicker value={space?.startDate ?? toDay(today())} onChange={setStart} />
          </Animated.View>
        )}
      </Animated.View>

      <Txt v="label" style={{ marginTop: 26, marginBottom: 10, marginLeft: 4 }}>
        倒数
      </Txt>
      <View style={{ gap: 10 }}>
        {events.map((e, i) => {
          const isAnn = e.kind === 'anniversary';
          return (
            <Animated.View key={e.key} entering={enter(i + 1)}>
              <PressScale
                disabled={!isAnn}
                onPress={() => isAnn && router.push({ pathname: '/anniversary/edit', params: { id: e.id } })}
                style={[styles.event, { backgroundColor: e.kind === 'festival' ? colors.surface : e.kind === 'milestone' ? colors.accentSoft : t.bg }]}>
                <Text style={{ fontSize: 30 }}>{e.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{e.title}</Txt>
                  <Txt v="caption">
                    {fmtDate(toDay(e.date), true)}
                    {e.sub ? ` · ${e.sub}` : ''}
                  </Txt>
                </View>
                {e.daysLeft === 0 ? (
                  <Txt v="heading">今天🎉</Txt>
                ) : (
                  <Row gap={2} style={{ alignItems: 'baseline' }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 36, color: colors.ink }}>{e.daysLeft}</Text>
                    <Txt v="caption">天</Txt>
                  </Row>
                )}
              </PressScale>
            </Animated.View>
          );
        })}
      </View>

      <Txt v="label" style={{ marginTop: 26, marginBottom: 10, marginLeft: 4 }}>
        我们的日子
      </Txt>
      <View style={styles.list}>
        {anns.data?.map((a, i) => {
          const since = diffDays(today(), parseDay(a.date));
          return (
            <PressScale key={a.id} haptics={false} onPress={() => router.push({ pathname: '/anniversary/edit', params: { id: a.id } })} style={[styles.row, i > 0 && styles.sep]}>
              <Text style={{ fontSize: 22 }}>{a.emoji || '💞'}</Text>
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong">{a.title}</Txt>
                <Txt v="caption">
                  {fmtFullDate(a.date)}
                  {a.lunar ? ` · ${lunarLabel(a.date)}` : ''}
                </Txt>
              </View>
              <Txt v="caption">{since >= 0 ? `已经 ${since} 天` : `还有 ${-since} 天`}</Txt>
            </PressScale>
          );
        })}
        {anns.data?.length === 0 && (
          <Txt v="body" color={colors.muted} style={{ padding: 16 }}>
            右上角添加第一个纪念日吧，生日、第一次约会、第一次旅行…
          </Txt>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  event: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 14 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
