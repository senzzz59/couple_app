import { useEffect } from 'react';
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radius, shadow } from '@/theme';

import { Blob } from './Mascot';
import { Button, Row, Txt } from './ui';

/** 一块会轻轻呼吸的占位色块，数据回来之前先把版面撑起来 */
export function Skeleton({ w = '100%', h = 14, r = 7, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [p]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.55 + p.value * 0.45 }));
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.surfaceAlt }, style, anim]} />;
}

/** 常见的几种列表占位 */
export function SkeletonList({ kind = 'card', count = 3 }: { kind?: 'card' | 'row' | 'grid' | 'cover'; count?: number }) {
  const items = Array.from({ length: count }, (_, i) => i);
  if (kind === 'grid') {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.grid}>
        {items.map((i) => (
          <View key={i} style={[styles.gridItem, { backgroundColor: colors.surface }]}>
            <Skeleton w={36} h={36} r={18} />
            <View style={{ gap: 8 }}>
              <Skeleton w="80%" h={14} />
              <Skeleton w="50%" h={11} />
            </View>
          </View>
        ))}
      </Animated.View>
    );
  }
  if (kind === 'row') {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.rowCard}>
        {items.map((i) => (
          <Row key={i} gap={12} style={[styles.row, i > 0 && styles.sep]}>
            <Skeleton w={24} h={24} r={12} />
            <View style={{ flex: 1, gap: 7 }}>
              <Skeleton w={`${70 - (i % 3) * 15}%`} h={14} />
              {i % 2 === 0 && <Skeleton w="35%" h={10} />}
            </View>
          </Row>
        ))}
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 14 }}>
      {items.map((i) => (
        <View key={i} style={[styles.card, kind === 'cover' && { padding: 0, overflow: 'hidden' }]}>
          {kind === 'cover' ? (
            <>
              <Skeleton h={170} r={0} />
              <View style={{ padding: 16, gap: 9 }}>
                <Skeleton w="60%" h={18} />
                <Skeleton w="40%" h={11} />
              </View>
            </>
          ) : (
            <>
              <Row gap={10}>
                <Skeleton w={36} h={36} r={18} />
                <View style={{ gap: 6, flex: 1 }}>
                  <Skeleton w="30%" h={13} />
                  <Skeleton w="18%" h={10} />
                </View>
              </Row>
              <View style={{ gap: 8, marginTop: 14 }}>
                <Skeleton w="92%" />
                <Skeleton w={`${55 + (i % 3) * 12}%`} />
              </View>
            </>
          )}
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * 列表的加载 / 出错占位：数据到了就什么都不显示。
 * 第一次加载显示骨架；加载失败显示重试按钮。
 */
export function QueryFallback({
  q,
  kind,
  count,
}: {
  q: { data: unknown; error: string | null; refresh: () => Promise<unknown> };
  kind?: 'card' | 'row' | 'grid' | 'cover';
  count?: number;
}) {
  if (q.data !== undefined) return null;
  if (q.error) return <LoadError message={q.error} onRetry={q.refresh} />;
  return <SkeletonList kind={kind} count={count} />;
}

export function LoadError({ message, onRetry }: { message?: string; onRetry: () => unknown }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <Blob who="him" size={72} mood="sleepy" />
      <Txt v="bodyStrong" style={{ marginTop: 6 }}>
        没加载出来
      </Txt>
      <Txt v="caption" style={{ textAlign: 'center' }}>
        {message && message.length < 40 ? message : '网络好像不太顺畅'}
      </Txt>
      <Button title="再试一次" variant="secondary" onPress={() => void onRetry()} style={{ marginTop: 8, height: 44 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, ...shadow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridItem: { width: '48.5%', minHeight: 150, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between' },
  rowCard: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, ...shadow },
  row: { paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
