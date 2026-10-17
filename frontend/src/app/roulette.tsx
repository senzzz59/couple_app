import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { FoodFilters } from '@/components/FoodFilters';
import { celebrate, Segmented, toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Button, Empty, PressScale, Row, Txt } from '@/components/ui';
import { categoryEmoji, categoryTone, placeArea } from '@/lib/food';
import { applyFoodFilter, DEFAULT_FILTER, type FilteredPlace, type FoodFilter } from '@/lib/foodFilter';
import { openInMaps } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { fmtKm, useMyLocation } from '@/lib/location';
import { useQuery } from '@/lib/store';
import type { Place } from '@/lib/types';
import { colors, fonts, radius, shadow } from '@/theme';

const SLICE_COLORS = ['#FDE2E8', '#FFFFFF', '#FCE8DA', '#F9C9D5', '#FDE2E8', '#FFFFFF', '#FCE8DA', '#F9C9D5'];
const MAX = 8;

function slicePath(i: number, n: number, r: number) {
  const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${r} ${r} L ${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`;
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

export default function Roulette() {
  const places = useQuery<Place[]>('/api/places');
  const { width } = useWindowDimensions();
  const [pool, setPool] = useState<'want' | 'all'>('want');
  const [seed, setSeed] = useState(0);
  const [filter, setFilter] = useState<FoodFilter>(DEFAULT_FILTER);
  const [result, setResult] = useState<FilteredPlace | null>(null);
  const [spinning, setSpinning] = useState(false);
  const { pos } = useMyLocation();

  const inPool = useMemo(() => (places.data ?? []).filter((p) => pool === 'all' || p.status === 'want'), [places.data, pool]);
  const candidates = useMemo(() => applyFoodFilter(inPool, filter, pos), [inPool, filter, pos]);
  const items = useMemo(
    () => shuffle(candidates).slice(0, MAX),
    // seed：每次“换一批”重新洗牌
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, seed]
  );
  const scoped = filter.where !== 'all' || !!filter.category;
  const change = (f: FoodFilter) => {
    if (spinning) return;
    setFilter(f);
    setResult(null);
  };

  const size = Math.min(width - 48, 340);
  const r = size / 2;
  const n = items.length;
  const rot = useSharedValue(0);
  const wheel = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  // 每划过一格震一下，像真的转盘
  useAnimatedReaction(
    () => (n ? Math.floor(rot.value / (360 / n)) : 0),
    (cur, prev) => {
      if (prev !== null && cur !== prev) scheduleOnRN(haptic.tick);
    }
  );

  const spin = () => {
    if (n < 2 || spinning) return;
    setResult(null);
    setSpinning(true);
    haptic.medium();
    const pick = Math.floor(Math.random() * n);
    const seg = 360 / n;
    // 指针在正上方：让第 pick 格的中心转到 0°
    const target = 360 - (pick * seg + seg / 2) + (Math.random() - 0.5) * seg * 0.6;
    const base = rot.value - (rot.value % 360);
    rot.value = withTiming(base + 360 * 6 + target, { duration: 4200, easing: Easing.bezier(0.12, 0.8, 0.2, 1) }, (done) => {
      if (done) scheduleOnRN(finish, pick);
    });
  };
  const finish = (pick: number) => {
    setSpinning(false);
    setResult(items[pick]);
    haptic.success();
    celebrate();
    // 结果卡片在转盘下面，滚过去让人一眼看到
    if (Platform.OS === 'web') setTimeout(() => document.getElementById('roulette-result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
  };

  return (
    <Screen back title="今天吃什么">
      <Segmented
        options={[
          { key: 'want', label: '想去的' },
          { key: 'all', label: '想去 + 吃过' },
        ]}
        value={pool}
        onChange={(k) => {
          if (spinning) return;
          setPool(k);
          setResult(null);
        }}
      />
      <View style={{ marginTop: 14 }}>
        <FoodFilters places={inPool} value={filter} onChange={change} showSort={false} />
      </View>
      <Row style={styles.countRow}>
        <Txt v="secondary">
          {candidates.length > MAX ? `${candidates.length} 家里随机抽 ${MAX} 家上转盘` : `从 ${candidates.length} 家里抽`}
        </Txt>
        {candidates.length > MAX && (
          <PressScale onPress={() => !spinning && (setSeed((s) => s + 1), setResult(null))} style={styles.reshuffle}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accentStrong }}>换一批</Text>
          </PressScale>
        )}
      </Row>

      {places.data && n < 2 ? (
        inPool.length >= 2 && scoped ? (
          <Empty
            emoji="🔍"
            title={filter.where === 'near' ? `${filter.radius}km 内不到两家` : '这个范围里不到两家'}
            hint="换个城市或者放大范围试试"
            action={<Button title="不限范围" variant="secondary" onPress={() => change(DEFAULT_FILTER)} />}
          />
        ) : (
          <Empty emoji="🎲" title="至少要两家店才能转" hint="先收藏几家想去的店" action={<Button title="去收藏" onPress={() => router.replace('/place/edit')} />} />
        )
      ) : (
        <View style={{ alignItems: 'center' }}>
          <View style={styles.pointer} />
          <Animated.View style={[{ width: size, height: size, borderRadius: r, ...shadow }, wheel]}>
            <Svg width={size} height={size}>
              {items.map((p, i) => {
                const mid = ((i + 0.5) / n) * 360;
                const label = p.name.length > 6 ? p.name.slice(0, 6) + '…' : p.name;
                return (
                  <G key={p.id}>
                    <Path d={slicePath(i, n, r)} fill={SLICE_COLORS[i % SLICE_COLORS.length]} stroke="#F5D3DC" strokeWidth={2} />
                    <G transform={`rotate(${mid} ${r} ${r})`}>
                      <SvgText x={r} y={r * 0.3} fontSize={20} textAnchor="middle">
                        {categoryEmoji(p.category)}
                      </SvgText>
                      <SvgText x={r} y={r * 0.3 + 24} fontSize={12} fontWeight="700" fill={colors.ink} textAnchor="middle">
                        {label}
                      </SvgText>
                    </G>
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
          <View style={[styles.hub, { top: 14 + r - 34 }]}>
            <Text style={{ fontSize: 26 }}>🍽️</Text>
          </View>

          <Button title={spinning ? '转呀转…' : result ? '再转一次' : '转！'} onPress={spin} disabled={spinning} style={{ marginTop: 28, width: 200 }} />
        </View>
      )}

      {result && (
        <Animated.View nativeID="roulette-result" entering={ZoomIn.springify().damping(12)} style={styles.result}>
          <Txt v="label">今天就吃</Txt>
          <Text style={{ fontFamily: fonts.round, fontSize: 34, lineHeight: 44, color: colors.ink, textAlign: 'center' }}>{result.name}</Text>
          <ResultMeta p={result} />
          <Animated.View entering={FadeIn.delay(300)} style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            <Button title="导航过去" variant="secondary" style={{ flex: 1 }} onPress={() => openInMaps(result).catch(() => toast('打不开高德地图', '⚠️'))} />
            <Button title="看看详情" variant="accent" style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/place/[id]', params: { id: result.id } })} />
          </Animated.View>
        </Animated.View>
      )}
    </Screen>
  );
}

function ResultMeta({ p }: { p: FilteredPlace }) {
  const tone = categoryTone(p.category ?? p.name);
  const meta = [p.price ? `¥${p.price}/人` : null, p.km != null ? `离你 ${fmtKm(p.km)}` : (placeArea(p) ?? p.city)].filter(Boolean).join(' · ');
  return (
    <Row gap={8} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
      {!!p.category && (
        <View style={[styles.cat, { backgroundColor: tone.bg }]}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: tone.ink }}>
            {categoryEmoji(p.category)} {p.category}
          </Text>
        </View>
      )}
      {!!meta && <Txt v="secondary">{meta}</Txt>}
    </Row>
  );
}

const styles = StyleSheet.create({
  countRow: { justifyContent: 'space-between', marginTop: 14, marginBottom: 18, minHeight: 32 },
  reshuffle: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.accentSoft },
  cat: { paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center' },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.ink,
    marginBottom: -10,
    zIndex: 2,
  },
  hub: { position: 'absolute', width: 68, height: 68, borderRadius: 34, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  result: { marginTop: 24, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, alignItems: 'center', gap: 10, ...shadow },
});
