import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { celebrate } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Button, Chip, Empty, Row, Txt } from '@/components/ui';
import { categoryEmoji } from '@/lib/food';
import { haptic } from '@/lib/haptics';
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
  const [result, setResult] = useState<Place | null>(null);
  const [spinning, setSpinning] = useState(false);

  const items = useMemo(() => {
    const src = (places.data ?? []).filter((p) => pool === 'all' || p.status === 'want');
    return shuffle(src).slice(0, MAX);
    // seed：每次“换一批”重新洗牌
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places.data, pool, seed]);

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
  };

  return (
    <Screen back title="今天吃什么" subtitle="LET FATE DECIDE">
      <Row gap={8} style={{ marginBottom: 20 }}>
        <Chip label="只转想去的" active={pool === 'want'} onPress={() => setPool('want')} />
        <Chip label="全部" active={pool === 'all'} onPress={() => setPool('all')} />
        <Chip label="换一批" onPress={() => setSeed((s) => s + 1)} />
      </Row>

      {places.data && n < 2 ? (
        <Empty emoji="🎲" title="至少要两家店才能转" hint="先去「美食」里收藏几家想去的店吧" action={<Button title="去收藏" onPress={() => router.replace('/place/edit')} />} />
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
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.result}>
          <Txt v="label">今天就吃</Txt>
          <Text style={{ fontFamily: fonts.round, fontSize: 34, color: colors.ink, textAlign: 'center' }}>{result.name}</Text>
          <Animated.View entering={FadeIn.delay(300)}>
            <Button title="就它了，看看详情" variant="accent" onPress={() => router.replace({ pathname: '/place/[id]', params: { id: result.id } })} />
          </Animated.View>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
