import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

import { Txt } from './ui';

export interface StarPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visited: boolean;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** 把经纬度投到卡片里（经度按纬度余弦压缩，避免变形） */
function project(points: StarPoint[], w: number, h: number, pad: number) {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  const single = points.length === 1 || (spanX < 1e-5 && spanY < 1e-5);
  return points.map((p) => ({
    ...p,
    x: single ? w / 2 : ox + (p.lng - minLng) * k * scale,
    y: single ? h / 2 : oy + (maxLat - p.lat) * scale,
  }));
}

/** 背景里的小星星：固定种子，每次渲染位置一样 */
function stars(w: number, h: number) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 40 }, () => ({ x: rand() * w, y: rand() * h, r: rand() * 1.2 + 0.3, o: rand() * 0.5 + 0.15 }));
}

/**
 * 没有地图 Key 时的足迹视图：去过的店是发光的星，按第一次去的顺序连成一条线。
 * points 需按时间顺序排好（想去的店只画空心点、不连线）。
 */
export function Constellation({ points, width, height, selectedId, onSelect }: { points: StarPoint[]; width: number; height: number; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const pts = useMemo(() => project(points, width, height, 44), [points, width, height]);
  const bg = useMemo(() => stars(width, height), [width, height]);
  const route = pts.filter((p) => p.visited);
  const d = route.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const len = route.reduce((s, p, i) => (i ? s + Math.hypot(p.x - route[i - 1].x, p.y - route[i - 1].y) : 0), 0) || 1;

  const draw = useSharedValue(0);
  useEffect(() => {
    draw.set(0);
    draw.set(withDelay(300, withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) })));
  }, [d, draw]);
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));

  return (
    <Pressable onPress={() => onSelect(null)} style={{ width, height, backgroundColor: '#4B2E35' }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {bg.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
        ))}
        {route.length > 1 && (
          <AnimatedPath d={d} stroke="rgba(255,179,198,0.6)" strokeWidth={1.5} fill="none" strokeDasharray={[len, len]} strokeLinejoin="round" animatedProps={pathProps} />
        )}
      </Svg>
      {pts.map((p, i) => {
        const sel = p.id === selectedId;
        return (
          <Animated.View key={p.id} entering={ZoomIn.delay(200 + i * 70).springify().damping(12)} style={[styles.dotWrap, { left: p.x - 22, top: p.y - 22 }]}>
            <Pressable hitSlop={6} onPress={() => onSelect(p.id)} style={styles.hit}>
              {p.visited ? (
                <>
                  <View style={[styles.glow, sel && { transform: [{ scale: 1.6 }], opacity: 0.45 }]} />
                  <View style={[styles.dot, sel && { backgroundColor: colors.white }]} />
                </>
              ) : (
                <View style={[styles.ring, sel && { borderColor: colors.white }]} />
              )}
            </Pressable>
            {(sel || (p.visited && pts.length <= 10)) && (
              <Txt numberOfLines={1} style={[styles.label, sel && { color: colors.white, fontWeight: '700' }]}>
                {p.name}
              </Txt>
            )}
          </Animated.View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dotWrap: { position: 'absolute', width: 44, alignItems: 'center' },
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, opacity: 0.25 },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFB3C6' },
  ring: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: colors.butter },
  label: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: -10, width: 90, textAlign: 'center' },
});
