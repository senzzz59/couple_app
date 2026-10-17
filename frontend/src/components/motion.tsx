import { Check, CircleAlert, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { colors, radius, shadow, springs, type } from '@/theme';

import { FlatHeart } from './Mascot';
import { Txt } from './ui';

// ================= 数字滚动：每一位像老虎机一样滚到目标值
function Digit({ digit, height, style, delay }: { digit: number; height: number; style: TextStyle; delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withSpring(-digit * height, { damping: 16, stiffness: 90, mass: 1 }));
  }, [digit, height, delay, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={anim}>
        {Array.from({ length: 10 }, (_, i) => (
          <Text key={i} style={[style, { height, lineHeight: height, textAlign: 'center' }]}>
            {i}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function RollingNumber({ value, style = type.display }: { value: number; style?: TextStyle }) {
  const height = (style.lineHeight as number) ?? 68;
  const digits = String(Math.max(0, Math.floor(value))).split('').map(Number);
  return (
    <View style={{ flexDirection: 'row' }}>
      {digits.map((d, i) => (
        <Digit key={`${digits.length}-${i}`} digit={d} height={height} style={{ ...style, fontVariant: ['tabular-nums'] }} delay={120 + i * 90} />
      ))}
    </View>
  );
}

// ================= 爱心粒子：点“想你”时从按钮里飞出来
const PARTICLES = ['#F27B96', '#F9B4C4', '#E5627F', '#FBD5BF', '#F9B4C4', '#F27B96', '#FDE2E8', '#E5627F'];
function Particle({ i, color, onDone }: { i: number; color: string; onDone?: () => void }) {
  const p = useSharedValue(0);
  // 随机参数只在挂载时取一次，父组件重渲染时不能变
  const [{ angle, dist, rot }] = useState(() => ({
    angle: (i / PARTICLES.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
    dist: 60 + Math.random() * 50,
    rot: (Math.random() - 0.5) * 60,
  }));
  useEffect(() => {
    p.set(withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) }));
    if (onDone) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
  }, [p, onDone]);
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value - 30 * p.value },
      { scale: interpolate(p.value, [0, 0.3, 1], [0.3, 1.2, 0.8]) },
      { rotate: `${rot * p.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, anim]}>
      <FlatHeart size={i % 3 === 0 ? 22 : 16} color={color} />
    </Animated.View>
  );
}

export function useBurst() {
  const [bursts, setBursts] = useState<number[]>([]);
  const fire = () => setBursts((b) => [...b, Date.now()]);
  const node = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {bursts.map((id) =>
        PARTICLES.map((c, i) => <Particle key={`${id}-${i}`} i={i} color={c} onDone={i === 0 ? () => setBursts((b) => b.filter((x) => x !== id)) : undefined} />)
      )}
    </View>
  );
  return { fire, node };
}

// ================= 彩带：完成待办、纪念日当天
type Listener = () => void;
const confettiListeners = new Set<Listener>();
export const celebrate = () => confettiListeners.forEach((l) => l());

const CONFETTI_COLORS = ['#F27B96', '#F9B4C4', '#FBD5BF', '#E5627F', '#FDE2E8', '#F7C8A8'];
function Piece({ i }: { i: number }) {
  const p = useSharedValue(0);
  const [{ x0, drift, spin, w }] = useState(() => ({
    x0: Math.random() * 100,
    drift: (Math.random() - 0.5) * 120,
    spin: (Math.random() - 0.5) * 900,
    w: 6 + Math.random() * 6,
  }));
  useEffect(() => {
    p.value = withDelay(Math.random() * 250, withTiming(1, { duration: 1800 + Math.random() * 900, easing: Easing.in(Easing.quad) }));
  }, [p]);
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(p.value, [0, 1], [-40, 900]) }, { translateX: drift * p.value }, { rotate: `${spin * p.value}deg` }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, left: `${x0}%`, width: w, height: w * 1.6, borderRadius: 2, backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }, anim]}
    />
  );
}

export function ConfettiHost() {
  const [shots, setShots] = useState<number[]>([]);
  useEffect(() => {
    const l = () => {
      const id = Date.now();
      setShots((s) => [...s, id]);
      setTimeout(() => setShots((s) => s.filter((x) => x !== id)), 3200);
    };
    confettiListeners.add(l);
    return () => void confettiListeners.delete(l);
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {shots.map((id) => Array.from({ length: 46 }, (_, i) => <Piece key={`${id}-${i}`} i={i} />))}
    </View>
  );
}

// ================= 顶部提示条（戳一戳 / 出错 / 撤销）
// 点一下或往上划就收起；带操作按钮（比如「撤销」）的提示会多停留一会儿
export type ToastAction = { label: string; onPress: () => void };
type ToastMsg = { id: number; emoji: string; title: string; body?: string; action?: ToastAction; duration: number; showEmoji?: boolean };
const toastListeners = new Set<(t: ToastMsg) => void>();
const dismissListeners = new Set<(id: number) => void>();
let toastSeq = 0;
/**
 * 顶部提示。emoji 传 '⚠️' 表示出错（显示图标和补充说明）；其它情况只显示一句话，
 * showEmoji 时才把 emoji 显示出来（比如对方戳了你一下）。
 */
export function toast(title: string, emoji = '', body?: string, opts: { action?: ToastAction; duration?: number; showEmoji?: boolean } = {}) {
  const id = Date.now() * 100 + (toastSeq++ % 100);
  const msg: ToastMsg = { id, emoji, title, body, action: opts.action, duration: opts.duration ?? (opts.action ? 4500 : 2400), showEmoji: opts.showEmoji };
  toastListeners.forEach((l) => l(msg));
  return id;
}
export const dismissToast = (id: number) => dismissListeners.forEach((l) => l(id));

function ToastCard({ t, onDone, gone }: { t: ToastMsg; onDone: () => void; gone: boolean }) {
  const y = useSharedValue(-140);
  const drag = useSharedValue(0);
  const [hiding, setHiding] = useState(false);
  const hide = () => setHiding(true);

  useEffect(() => {
    y.set(withSpring(0, springs.bouncy));
    const timer = setTimeout(() => setHiding(true), t.duration);
    return () => clearTimeout(timer);
  }, [y, t.duration]);

  useEffect(() => {
    if (!hiding && !gone) return;
    y.set(withTiming(-160, { duration: 220 }));
    const timer = setTimeout(onDone, 240);
    return () => clearTimeout(timer);
  }, [hiding, gone, y, onDone]);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onChange((e) => {
      const next = drag.get() + e.changeY;
      drag.set(next > 0 ? next * 0.25 : next);
    })
    .onEnd((e) => {
      if (drag.get() < -30 || e.velocityY < -500) {
        drag.set(withTiming(-160, { duration: 160 }));
        scheduleOnRN(hide);
      } else drag.set(withSpring(0, springs.snappy));
    });

  const isError = t.emoji === '⚠️';
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value + drag.value }],
    opacity: interpolate(y.value + drag.value, [-140, -40, 0], [0, 1, 1], 'clamp'),
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.toast, anim]}>
        <Pressable accessibilityRole="alert" onPress={hide} style={styles.toastMain}>
          {isError ? <CircleAlert size={18} color="#FF9AAE" /> : t.showEmoji ? <Text style={{ fontSize: 20 }}>{t.emoji}</Text> : t.emoji === '✓' ? <Check size={17} color="#9BE3B5" strokeWidth={2.6} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Txt v="bodyStrong" color={colors.white} style={{ fontSize: 15, lineHeight: 21 }} numberOfLines={2}>
              {t.title}
            </Txt>
            {isError && t.body ? (
              <Txt v="secondary" color="rgba(255,255,255,0.65)" numberOfLines={2}>
                {t.body}
              </Txt>
            ) : null}
          </View>
        </Pressable>
        {t.action && (
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptic.tap();
              t.action?.onPress();
              hide();
            }}
            style={({ pressed }) => [styles.toastAction, pressed && { opacity: 0.7 }]}>
            <Txt v="bodyStrong" color="#FFB3C4" style={{ fontSize: 15 }}>
              {t.action.label}
            </Txt>
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastMsg[]>([]);
  const [gone, setGone] = useState<number[]>([]);
  useEffect(() => {
    const l = (t: ToastMsg) => setItems((s) => [...s.slice(-1), t]);
    const d = (id: number) => setGone((g) => [...g, id]);
    toastListeners.add(l);
    dismissListeners.add(d);
    return () => {
      toastListeners.delete(l);
      dismissListeners.delete(d);
    };
  }, []);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
      {items.map((t) => (
        <ToastCard
          key={t.id}
          t={t}
          gone={gone.includes(t.id)}
          onDone={() => {
            setItems((s) => s.filter((x) => x.id !== t.id));
            setGone((g) => g.filter((x) => x !== t.id));
          }}
        />
      ))}
    </View>
  );
}

// ================= 分段选择器：滑动的指示块
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const x = useSharedValue(0);
  const seg = w / options.length;
  useEffect(() => {
    x.value = withSpring(idx * seg, springs.soft);
  }, [idx, seg, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: seg }));
  return (
    <View style={styles.seg} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 8)}>
      {w > 0 && <Animated.View style={[styles.segThumb, anim]} />}
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={styles.segItem}
          onPress={() => {
            if (o.key !== value) haptic.tick();
            onChange(o.key);
          }}>
          <Txt v="bodyStrong" style={{ fontSize: 14 }} color={o.key === value ? colors.ink : colors.muted}>
            {o.label}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}

// ================= 星级评分：点到哪颗，那颗弹一下
function StarItem({ filled, onPress, size }: { filled: boolean; onPress?: () => void; size: number }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={!onPress}
      hitSlop={4}
      onPress={() => {
        s.set(withSequence(withTiming(1.35, { duration: 90 }), withSpring(1, springs.bouncy)));
        haptic.tick();
        onPress?.();
      }}>
      <Animated.View style={anim}>
        <Star size={size} color={filled ? '#F5B83D' : colors.faint} fill={filled ? '#F5B83D' : 'transparent'} strokeWidth={1.8} />
      </Animated.View>
    </Pressable>
  );
}

export function StarRating({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarItem key={n} size={size} filled={value >= n - 0.25} onPress={onChange ? () => onChange(value === n ? n - 1 : n) : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    maxWidth: 440,
    backgroundColor: 'rgba(42,31,35,0.94)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 8,
    ...shadow,
  },
  toastMain: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  toastAction: { paddingLeft: 4, height: 28, justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, height: 44 },
  segThumb: { position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
