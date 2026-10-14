import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Envelope } from '@/components/Envelope';
import { Screen } from '@/components/Screen';
import { Button, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { diffDays, fmtFullDate, parseDay, today } from '@/lib/dates';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Capsule } from '@/lib/types';
import { colors, fonts, radius, shadow } from '@/theme';

const daysUntil =(c: Capsule) => diffDays(parseDay(c.unlockAt), today());

function ReadyGlow() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [t]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.25 + t.value * 0.45, transform: [{ scale: 1 + t.value * 0.04 }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, anim]} />;
}

function CapsuleRow({ c, i }: { c: Capsule; i: number }) {
  const { me, userName } = useCouple();
  const ready = !c.locked && !c.openedBy.includes(me?.id ?? '');
  const left = daysUntil(c);
  const from = c.createdBy === me?.id ? '我写的' : `${userName(c.createdBy) || 'TA'} 写的`;
  return (
    <Animated.View entering={enter(i)}>
      <PressScale onPress={() => router.push({ pathname: '/capsule/[id]', params: { id: c.id } })} style={[styles.row, ready && styles.rowReady]}>
        {ready && <ReadyGlow />}
        <Envelope width={76} />
        <View style={{ flex: 1, gap: 3 }}>
          <Txt v="bodyStrong" numberOfLines={1}>
            {c.title}
          </Txt>
          <Txt v="caption">
            {from} · {fmtFullDate(c.unlockAt)} 解锁
          </Txt>
          {c.locked && (
            <Txt v="caption" color={colors.faint}>
              {c.letterLength} 字{c.photoCount ? ` · ${c.photoCount} 张照片` : ''}
            </Txt>
          )}
        </View>
        {c.locked ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink }}>{left}</Text>
            <Txt v="caption">天后</Txt>
          </View>
        ) : ready ? (
          <View style={styles.readyPill}>
            <Txt v="caption" color={colors.white} style={{ fontWeight: '700' }}>
              可以打开
            </Txt>
          </View>
        ) : null}
      </PressScale>
    </Animated.View>
  );
}

export default function Capsules() {
  const { me } = useCouple();
  const list = useQuery<Capsule[]>('/api/capsules');
  const all = list.data ?? [];
  const ready = all.filter((c) => !c.locked && !c.openedBy.includes(me?.id ?? ''));
  const sealed = all.filter((c) => c.locked);
  const opened = all.filter((c) => !c.locked && c.openedBy.includes(me?.id ?? '')).reverse();
  let i = 0;

  return (
    <Screen
      back
      title="时光胶囊"
      subtitle="LETTERS TO OUR FUTURE"
      onRefresh={async () => invalidate('capsules')}
      right={<IconButton icon={Plus} onPress={() => router.push('/capsule/new')} />}>
      {list.data && all.length === 0 && (
        <Empty
          emoji="💌"
          title="给未来的你们写一封信"
          hint="选一个日子封存起来，在那天之前谁都打不开，包括你自己"
          action={<Button title="写一封" onPress={() => router.push('/capsule/new')} />}
        />
      )}
      {[
        { label: '可以打开了', items: ready },
        { label: '封存中', items: sealed },
        { label: '已经读过', items: opened },
      ]
        .filter((s) => s.items.length)
        .map((s) => (
          <View key={s.label} style={{ marginBottom: 22 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }}>
              <Txt v="label">{s.label}</Txt>
              <Txt v="caption">{s.items.length}</Txt>
            </Row>
            <View style={{ gap: 10 }}>
              {s.items.map((c) => (
                <CapsuleRow key={c.id} c={c} i={i++} />
              ))}
            </View>
          </View>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, paddingRight: 18, ...shadow },
  rowReady: { borderWidth: 1.5, borderColor: colors.accent },
  glow: { borderRadius: radius.lg, borderWidth: 6, borderColor: colors.accentSoft, margin: -4 },
  readyPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
});
