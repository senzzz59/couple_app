import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { mediaUrl } from '@/lib/media';
import { colors, radius, shadow } from '@/theme';

import { enter, PressScale, Txt } from './ui';

/** /api/gallery/months 的一项：YYYY-MM、数量、几张封面（收藏的优先） */
export type MonthCount = { month: string; count: number; covers?: string[] };

export type GalleryView = 'years' | 'months' | 'all';

const thumb = (name?: string) => (name ? mediaUrl(name, 'thumb') : undefined);

function byYear(months: MonthCount[]) {
  const years = new Map<string, MonthCount[]>();
  for (const m of months) {
    const y = m.month.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), m]);
  }
  return [...years].sort((a, b) => b[0].localeCompare(a[0]));
}

/** 「月」：每个月一张大卡片，点了去「全部」里的那个月 */
export function MonthCards({ months, onPick, onYearLayout }: { months: MonthCount[]; onPick: (month: string) => void; onYearLayout?: (year: string, y: number) => void }) {
  const years = useMemo(() => byYear(months), [months]);
  let i = 0;
  return (
    <View style={{ gap: 22 }}>
      {years.map(([year, list]) => (
        <View key={year} style={{ gap: 12 }} onLayout={onYearLayout && ((e) => onYearLayout(year, e.nativeEvent.layout.y))}>
          <Txt v="heading" style={{ fontSize: 22, paddingHorizontal: 2 }}>
            {year}年
          </Txt>
          {list.map((m) => {
            const [cover, ...minis] = m.covers ?? [];
            return (
              <Animated.View key={m.month} entering={enter(i++)}>
                <PressScale scaleTo={0.97} onPress={() => onPick(m.month)} style={styles.monthCard} accessibilityLabel={`${year}年${Number(m.month.slice(5))}月，${m.count} 项`}>
                  {cover ? <Image source={thumb(cover)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.pink }]} />}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={styles.shade} />
                  <View style={styles.minis}>
                    {minis.slice(0, 3).map((n) => (
                      <Image key={n} source={thumb(n)} style={styles.mini} contentFit="cover" />
                    ))}
                  </View>
                  <View style={styles.caption}>
                    <Txt v="title" color={colors.white} style={{ fontSize: 26, lineHeight: 32 }}>
                      {Number(m.month.slice(5))}月
                    </Txt>
                    <Txt v="secondary" color="rgba(255,255,255,0.9)">
                      {m.count} 项
                    </Txt>
                  </View>
                </PressScale>
              </Animated.View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 「年」：每年一张大卡片（三张封面拼起来），点了去「月」里的那一年 */
export function YearCards({ months, onPick }: { months: MonthCount[]; onPick: (year: string) => void }) {
  const years = useMemo(() => byYear(months), [months]);
  return (
    <View style={{ gap: 16 }}>
      {years.map(([year, list], i) => {
        const total = list.reduce((n, m) => n + m.count, 0);
        // 每个月的第一张封面，凑三张
        const covers = [...list.map((m) => m.covers?.[0]), ...list.flatMap((m) => m.covers?.slice(1) ?? [])].filter((x): x is string => !!x).slice(0, 3);
        return (
          <Animated.View key={year} entering={enter(i)}>
            <PressScale scaleTo={0.97} onPress={() => onPick(year)} style={styles.yearCard} accessibilityLabel={`${year}年，${total} 项`}>
              <View style={styles.mosaic}>
                <Image source={thumb(covers[0])} style={[styles.tile, { flex: 1 }]} contentFit="cover" transition={200} />
                {covers.length > 1 && (
                  <View style={{ flex: 1, gap: 2 }}>
                    <Image source={thumb(covers[1])} style={[styles.tile, { flex: 1 }]} contentFit="cover" transition={200} />
                    {covers[2] && <Image source={thumb(covers[2])} style={[styles.tile, { flex: 1 }]} contentFit="cover" transition={200} />}
                  </View>
                )}
              </View>
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={[styles.shade, { height: 120 }]} />
              <View style={styles.caption}>
                <Txt v="title" color={colors.white} style={{ fontSize: 34, lineHeight: 40 }}>
                  {year}
                </Txt>
                <Txt v="secondary" color="rgba(255,255,255,0.92)">
                  {total} 项 · {list.length} 个月
                </Txt>
              </View>
            </PressScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  monthCard: { height: 196, borderRadius: radius.lg + 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt, ...shadow },
  yearCard: { height: 250, borderRadius: radius.lg + 6, overflow: 'hidden', backgroundColor: colors.surfaceAlt, ...shadow },
  mosaic: { ...StyleSheet.absoluteFill, flexDirection: 'row', gap: 2 },
  tile: { backgroundColor: colors.pink },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  caption: { position: 'absolute', left: 16, bottom: 14 },
  minis: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', gap: 4 },
  mini: { width: 34, height: 34, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: colors.pink },
});
