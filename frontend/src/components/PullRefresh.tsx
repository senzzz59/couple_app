import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { colors, shadow, springs } from '@/theme';

import { FlatHeart } from './Mascot';

const THRESHOLD = 70;
const MAX = 120;
const HOLD = 58;
const MIN_SPIN = 650;

type TouchLike = { nativeEvent: { pageY?: number; touches?: ArrayLike<{ pageY: number }> } };
const touchY = (e: TouchLike) => e.nativeEvent.touches?.[0]?.pageY ?? e.nativeEvent.pageY ?? 0;

/**
 * 下拉刷新。原生用系统的 RefreshControl；网页上浏览器没有这个手势，
 * 用触摸事件自己实现：在顶部往下拉，一颗小爱心跟着落下来，松手后跳动直到刷新完成。
 * scrollY：页面滚动位置（useAnimatedScrollHandler 里写入）。
 */
export function usePullRefresh(onRefresh: (() => Promise<unknown>) | undefined, scrollY: SharedValue<number>, top: number) {
  const [refreshing, setRefreshing] = useState(false);
  const pull = useSharedValue(0);
  const beat = useSharedValue(1);
  // 1 = 爱心变粉（拉够了 / 正在刷新）
  const lit = useSharedValue(0);
  const start = useRef<number | null>(null);
  const armed = useRef(false);
  const busy = useRef(false);
  const web = Platform.OS === 'web' && !!onRefresh;

  const run = async () => {
    if (!onRefresh || busy.current) return;
    busy.current = true;
    setRefreshing(true);
    haptic.medium();
    const t0 = Date.now();
    await onRefresh().catch(() => {});
    const wait = MIN_SPIN - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    busy.current = false;
    setRefreshing(false);
  };

  useEffect(() => {
    if (!web) return;
    if (refreshing) {
      lit.set(1);
      pull.set(withSpring(HOLD, springs.snappy));
      beat.set(withRepeat(withSequence(withTiming(1.25, { duration: 180 }), withTiming(1, { duration: 180 }), withTiming(1, { duration: 280 })), -1));
    } else {
      cancelAnimation(beat);
      beat.set(withTiming(1, { duration: 120 }));
      pull.set(withSpring(0, springs.soft));
      lit.set(withTiming(0, { duration: 300 }));
    }
  }, [refreshing, web, pull, beat, lit]);

  const touchProps = web
    ? {
        onTouchStart: (e: GestureResponderEvent) => {
          start.current = !busy.current && scrollY.get() <= 0 ? touchY(e as unknown as TouchLike) : null;
          armed.current = false;
        },
        onTouchMove: (e: GestureResponderEvent) => {
          if (start.current == null) return;
          // 页面已经往下滚了，说明用户是在滚动而不是下拉
          if (scrollY.get() > 2) {
            start.current = null;
            pull.set(withSpring(0, springs.snappy));
            return;
          }
          const d = Math.max(0, touchY(e as unknown as TouchLike) - start.current);
          // 越拉越费劲
          const p = Math.min(MAX, d * 0.55 - (d * d) / 5000);
          pull.set(Math.max(0, p));
          const over = pull.get() >= THRESHOLD;
          if (over !== armed.current) {
            armed.current = over;
            lit.set(withTiming(over ? 1 : 0, { duration: 120 }));
            if (over) haptic.tick();
          }
        },
        onTouchEnd: () => {
          if (start.current == null) return;
          start.current = null;
          if (armed.current) run();
          else {
            pull.set(withSpring(0, springs.soft));
            lit.set(0);
          }
          armed.current = false;
        },
        onTouchCancel: () => {
          start.current = null;
          armed.current = false;
          if (!busy.current) {
            pull.set(withSpring(0, springs.soft));
            lit.set(0);
          }
        },
      }
    : {};

  const wrap = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, 24, 50], [0, 0.6, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: pull.value - 46 },
      { rotate: `${interpolate(pull.value, [0, THRESHOLD], [-60, 0], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(pull.value, [0, THRESHOLD], [0.5, 1], Extrapolation.CLAMP) },
    ],
  }));
  const grey = useAnimatedStyle(() => ({ opacity: 1 - lit.value }));
  const pink = useAnimatedStyle(() => ({ opacity: lit.value, transform: [{ scale: beat.value * (0.8 + lit.value * 0.2) }] }));

  const indicator = web ? (
    <Animated.View pointerEvents="none" style={[styles.indicator, { top }, wrap]}>
      <View style={styles.bubble}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, grey]}>
          <FlatHeart size={20} color={colors.faint} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, pink]}>
          <FlatHeart size={20} />
        </Animated.View>
      </View>
    </Animated.View>
  ) : null;

  const refreshControl =
    !web && onRefresh ? <RefreshControl refreshing={refreshing} tintColor={colors.muted} onRefresh={run} /> : undefined;

  return { touchProps, indicator, refreshControl };
}

const styles = StyleSheet.create({
  indicator: { position: 'absolute', alignSelf: 'center', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  bubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, ...shadow },
  center: { alignItems: 'center', justifyContent: 'center' },
});
