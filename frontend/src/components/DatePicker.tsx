import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { fmtDate, lunarLabel, parseDay, toDay } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { colors, radius } from '@/theme';

import { PressScale, Row, Txt } from './ui';

const W = ['日', '一', '二', '三', '四', '五', '六'];

/** 可展开的日历选择器（纯 JS，iOS / Android / Web 表现一致） */
export function DatePicker({ label, value, onChange, showLunar }: { label?: string; value: string | null; onChange: (v: string) => void; showLunar?: boolean }) {
  const [open, setOpen] = useState(false);
  const base = value ? parseDay(value) : new Date();
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));

  const first = cursor.getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (months: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1));
  const todayStr = toDay(new Date());

  return (
    <Animated.View layout={LinearTransition.springify().damping(20)}>
      {label && (
        <Txt v="label" style={{ marginBottom: 8, marginLeft: 4 }}>
          {label}
        </Txt>
      )}
      <View style={styles.box}>
        <PressScale haptics={false} onPress={() => setOpen((o) => !o)} style={styles.head}>
          <Txt v="body" color={value ? colors.ink : colors.faint}>
            {value ? fmtDate(value, true) : '选择日期'}
          </Txt>
          {value && showLunar && <Txt v="caption">{lunarLabel(value)}</Txt>}
        </PressScale>
        {open && (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Row gap={2}>
                <Nav icon={ChevronsLeft} onPress={() => move(-12)} />
                <Nav icon={ChevronLeft} onPress={() => move(-1)} />
              </Row>
              <Txt v="bodyStrong">
                {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
              </Txt>
              <Row gap={2}>
                <Nav icon={ChevronRight} onPress={() => move(1)} />
                <Nav icon={ChevronsRight} onPress={() => move(12)} />
              </Row>
            </Row>
            <View style={styles.grid}>
              {W.map((w) => (
                <View key={w} style={styles.cell}>
                  <Txt v="caption" style={{ fontSize: 12 }}>
                    {w}
                  </Txt>
                </View>
              ))}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.cell} />;
                const ds = toDay(new Date(cursor.getFullYear(), cursor.getMonth(), d));
                const selected = ds === value;
                return (
                  <Pressable
                    key={ds}
                    style={styles.cell}
                    onPress={() => {
                      haptic.tick();
                      onChange(ds);
                    }}>
                    {selected && <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.dot} />}
                    <Txt v="body" style={{ fontSize: 15, fontWeight: selected || ds === todayStr ? '700' : '400' }} color={selected ? colors.white : ds === todayStr ? colors.accent : colors.ink}>
                      {d}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

function Nav({ icon: Icon, onPress }: { icon: typeof ChevronLeft; onPress: () => void }) {
  return (
    <Pressable hitSlop={6} onPress={onPress} style={{ padding: 6 }}>
      <Icon size={18} color={colors.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  head: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: '80%', height: '80%', borderRadius: 999, backgroundColor: colors.ink },
});
