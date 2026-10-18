import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { FlatHeart } from './Mascot';

/**
 * 发表情的特效：
 * - emojiRain(符号)：整屏飘落一阵（爱你、亲亲、💗 这类），两个人的屏幕都会下
 * - useSparkle()：在某个元素周围迸出一圈小爱心 / 表情（每发一个表情都有）
 * 系统设了「减少动态效果」时不下雨，迸粒子也省掉。
 */

// ================= 表情雨
const rainListeners = new Set<(symbol: string) => void>();
export const emojiRain = (symbol: string) => rainListeners.forEach((l) => l(symbol));

function Drop({ symbol, height }: { symbol: string; height: number }) {
  const p = useSharedValue(0);
  const [{ x, size, delay, duration, sway, spin }] = useState(() => ({
    x: Math.random() * 94,
    size: 22 + Math.random() * 22,
    delay: Math.random() * 900,
    duration: 2000 + Math.random() * 1100,
    sway: (Math.random() - 0.5) * 70,
    spin: (Math.random() - 0.5) * 70,
  }));
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) })));
  }, [p, delay, duration]);
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.06, 0.85, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [-60, height + 40]) },
      { translateX: Math.sin(p.value * Math.PI * 2) * sway * 0.5 + sway * p.value * 0.5 },
      { rotate: `${spin * p.value}deg` },
      { scale: interpolate(p.value, [0, 0.15, 1], [0.6, 1.1, 1]) },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: `${x}%` }, anim]}>
      <Text style={{ fontSize: size }}>{symbol}</Text>
    </Animated.View>
  );
}

export function EffectsHost() {
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [rains, setRains] = useState<{ id: number; symbol: string }[]>([]);
  useEffect(() => {
    const l = (symbol: string) => {
      if (reduce) return;
      const id = Date.now() + Math.random();
      // 同时最多两阵，连着发也不会卡
      setRains((r) => [...r.slice(-1), { id, symbol }]);
      setTimeout(() => setRains((r) => r.filter((x) => x.id !== id)), 4300);
    };
    rainListeners.add(l);
    return () => void rainListeners.delete(l);
  }, [reduce]);
  return (
    // 裁掉飘出屏幕两边的：不能把页面撑宽（iOS 会因此整页缩小）
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {rains.map((r) => Array.from({ length: 24 }, (_, i) => <Drop key={`${r.id}-${i}`} symbol={r.symbol} height={height} />))}
    </View>
  );
}

// ================= 迸粒子
const COLORS = ['#F27B96', '#F9B4C4', '#E5627F', '#FBD5BF', '#FFC93C', '#F27B96', '#FDE2E8', '#E5627F', '#8FCBF2', '#F9B4C4'];

function Spark({ i, n, symbol, spread }: { i: number; n: number; symbol?: string; spread: number }) {
  const p = useSharedValue(0);
  const [{ angle, dist, rot, kind }] = useState(() => ({
    angle: (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
    dist: spread * (0.7 + Math.random() * 0.6),
    rot: (Math.random() - 0.5) * 90,
    // 一半小爱心、几个小圆点，带符号时再混几个符号
    kind: symbol && i % 3 === 0 ? 'symbol' : i % 2 ? 'dot' : 'heart',
  }));
  useEffect(() => {
    p.set(withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [p]);
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 0.65, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value - 18 * p.value },
      { scale: interpolate(p.value, [0, 0.3, 1], [0.3, 1.15, 0.7]) },
      { rotate: `${rot * p.value}deg` },
    ],
  }));
  const color = COLORS[i % COLORS.length];
  return (
    <Animated.View style={[{ position: 'absolute' }, anim]}>
      {kind === 'symbol' ? (
        <Text style={{ fontSize: 18 }}>{symbol}</Text>
      ) : kind === 'heart' ? (
        <FlatHeart size={14} color={color} />
      ) : (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      )}
    </Animated.View>
  );
}

/** 放在一个相对定位的容器里：fire() 时从中间迸出一圈 */
export function useSparkle(spread = 56) {
  const reduce = useReducedMotion();
  const [bursts, setBursts] = useState<{ id: number; symbol?: string }[]>([]);
  const fire = (symbol?: string) => {
    if (reduce) return;
    const id = Date.now() + Math.random();
    setBursts((b) => [...b.slice(-2), { id, symbol }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 950);
  };
  const node = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', overflow: 'visible' }]}>
      {bursts.map((b) => Array.from({ length: 10 }, (_, i) => <Spark key={`${b.id}-${i}`} i={i} n={10} symbol={b.symbol} spread={spread} />))}
    </View>
  );
  return { fire, node };
}

/** 一出现就迸一次（新消息、对方的回应） */
export function SparkleOnMount({ symbol, spread }: { symbol?: string; spread?: number }) {
  const { fire, node } = useSparkle(spread);
  useEffect(() => {
    fire(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return node;
}
