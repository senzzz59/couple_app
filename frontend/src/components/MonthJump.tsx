import { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, radius } from '@/theme';

import { Sheet } from './Sheet';
import { PressScale, Row, Txt } from './ui';

export type MonthCount = { month: string; count: number };

/**
 * 跳到某年某月：每年一块，12 个月排成 4 列，有照片的月份可以点（下面是数量），没有的灰掉。
 * month 格式 YYYY-MM。
 */
export function MonthJump({ visible, onClose, onClosed, months, current, onPick }: { visible: boolean; onClose: () => void; onClosed?: () => void; months: MonthCount[]; current?: string | null; onPick: (month: string) => void }) {
  const { height } = useWindowDimensions();
  const years = useMemo(() => {
    const byYear = new Map<string, Map<number, number>>();
    for (const m of months) {
      const [y, mo] = m.month.split('-');
      if (!byYear.has(y)) byYear.set(y, new Map());
      byYear.get(y)!.set(Number(mo), m.count);
    }
    return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, counts]) => ({ year, counts, total: [...counts.values()].reduce((n, c) => n + c, 0) }));
  }, [months]);

  return (
    <Sheet visible={visible} onClose={onClose} onClosed={onClosed} dragAnywhere={false} style={{ gap: 12 }}>
      <Txt v="heading">选择月份</Txt>
      <ScrollView style={{ maxHeight: height * 0.68 }} contentContainerStyle={{ gap: 20, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {years.map(({ year, counts, total }) => (
          <View key={year} style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Txt v="heading" style={{ fontSize: 20 }}>
                {year}年
              </Txt>
              <Txt v="secondary">{total} 项</Txt>
            </Row>
            <View style={styles.grid}>
              {Array.from({ length: 12 }, (_, i) => {
                const month = i + 1;
                const key = `${year}-${String(month).padStart(2, '0')}`;
                const count = counts.get(month) ?? 0;
                const on = key === current;
                return (
                  <PressScale
                    key={key}
                    disabled={!count}
                    accessibilityLabel={`${year}年${month}月`}
                    onPress={() => onPick(key)}
                    style={[styles.cell, count ? styles.cellOn : styles.cellEmpty, on && styles.cellCurrent]}>
                    <Txt v="bodyStrong" color={on ? colors.white : count ? colors.ink : colors.faint}>
                      {month}月
                    </Txt>
                    {count > 0 && (
                      <Txt v="secondary" color={on ? 'rgba(255,255,255,0.85)' : colors.muted}>
                        {count}
                      </Txt>
                    )}
                  </PressScale>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '23%', flexGrow: 1, height: 62, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 1 },
  cellOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cellEmpty: { backgroundColor: colors.surfaceAlt, opacity: 0.6 },
  cellCurrent: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
});
