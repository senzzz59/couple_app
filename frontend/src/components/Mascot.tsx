import { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { mascot } from '@/theme';
import { mascotFor } from '@/lib/profile';
import type { User } from '@/lib/types';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type BlobMood = 'normal' | 'happy' | 'sleepy' | 'love' | 'laugh' | 'wow' | 'stare' | 'angry' | 'cry' | 'kiss' | 'shy';

/** 以 (cx, cy) 为中心、宽约 2s 的小爱心 */
const heartAt = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + s * 0.9} C${cx - s * 1.6} ${cy - s * 0.1} ${cx - s * 0.9} ${cy - s * 1.25} ${cx} ${cy - s * 0.45} C${cx + s * 0.9} ${cy - s * 1.25} ${cx + s * 1.6} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;

/** 以 (cx, cy) 为中心、外半径 r 的五角星 */
const starAt = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
};

const TEAR = '#8FCBF2';

/** 新表情的五官（眼睛 + 腮红 + 嘴）；normal / happy / sleepy 在 Blob 里画 */
function Face({ mood }: { mood: BlobMood }) {
  const e = mascot.eye;
  const line = { stroke: e, strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' };
  const cheeks = (rx = 7, ry = 4.2, opacity = 0.55) => (
    <>
      <Ellipse cx="27" cy="64" rx={rx} ry={ry} fill={mascot.cheek} opacity={opacity} />
      <Ellipse cx="73" cy="64" rx={rx} ry={ry} fill={mascot.cheek} opacity={opacity} />
    </>
  );
  const closed = (
    <>
      <Path d="M33 56 Q38 50 43 56" {...line} />
      <Path d="M57 56 Q62 50 67 56" {...line} />
    </>
  );
  switch (mood) {
    case 'love':
      return (
        <>
          <Path d={heartAt(38, 54, 5.6)} fill="#E5627F" />
          <Path d={heartAt(62, 54, 5.6)} fill="#E5627F" />
          {cheeks(7.5, 4.6, 0.7)}
          <Path d="M43 62 Q50 71 57 62" {...line} strokeWidth={2.8} />
        </>
      );
    case 'laugh':
      return (
        <>
          <Path d="M33 50 L42 54.5 L33 59" {...line} strokeLinejoin="round" />
          <Path d="M67 50 L58 54.5 L67 59" {...line} strokeLinejoin="round" />
          <Path d="M29 59 Q26 65 29.5 67 Q33 65 29 59 Z" fill={TEAR} />
          <Path d="M71 59 Q74 65 70.5 67 Q67 65 71 59 Z" fill={TEAR} />
          {cheeks()}
          <Path d="M41 62 Q50 77 59 62 Z" fill={e} />
          <Ellipse cx="50" cy="69.5" rx="4.5" ry="2.4" fill="#F27B96" />
        </>
      );
    case 'wow':
      return (
        <>
          <Path d={starAt(38, 54, 6.4)} fill="#FFC93C" stroke="#E8A21A" strokeWidth={1} />
          <Path d={starAt(62, 54, 6.4)} fill="#FFC93C" stroke="#E8A21A" strokeWidth={1} />
          {cheeks()}
          <Ellipse cx="50" cy="67" rx="3.6" ry="4.4" fill={e} />
        </>
      );
    case 'stare':
      return (
        <>
          <Ellipse cx="37" cy="53" rx="7.2" ry="8.4" fill="#FFFFFF" />
          <Ellipse cx="63" cy="53" rx="7.2" ry="8.4" fill="#FFFFFF" />
          <Ellipse cx="38" cy="55" rx="4.8" ry="5.8" fill={e} />
          <Ellipse cx="62" cy="55" rx="4.8" ry="5.8" fill={e} />
          <Ellipse cx="39.6" cy="52.6" rx="1.6" ry="1.8" fill="#FFFFFF" />
          <Ellipse cx="63.6" cy="52.6" rx="1.6" ry="1.8" fill="#FFFFFF" />
          {cheeks(6, 3.6, 0.45)}
          <Path d="M47 67 L53 67" {...line} strokeWidth={2.6} />
        </>
      );
    case 'angry':
      return (
        <>
          <Path d="M30 45 L44 50" {...line} />
          <Path d="M70 45 L56 50" {...line} />
          <Ellipse cx="38" cy="56" rx="3.6" ry="3.8" fill={e} />
          <Ellipse cx="62" cy="56" rx="3.6" ry="3.8" fill={e} />
          {cheeks(8, 4.8, 0.8)}
          <Path d="M43 69 Q50 62 57 69" {...line} strokeWidth={2.8} />
          <Path d="M76 28 l4 4 M84 28 l-4 4 M76 36 l4 -4 M84 36 l-4 -4" stroke="#E5413F" strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    case 'cry':
      return (
        <>
          <Path d="M32 51 L43 54" {...line} strokeWidth={2.6} />
          <Path d="M68 51 L57 54" {...line} strokeWidth={2.6} />
          <Ellipse cx="38" cy="58" rx="4.4" ry="4.8" fill={e} />
          <Ellipse cx="62" cy="58" rx="4.4" ry="4.8" fill={e} />
          <Ellipse cx="39.5" cy="56.4" rx="1.6" ry="1.6" fill="#FFFFFF" />
          <Ellipse cx="63.5" cy="56.4" rx="1.6" ry="1.6" fill="#FFFFFF" />
          <Path d="M35 63 Q33 72 36 78 Q39 72 37.5 63 Z" fill={TEAR} />
          <Path d="M65 63 Q67 72 64 78 Q61 72 62.5 63 Z" fill={TEAR} />
          {cheeks(6.5, 4, 0.5)}
          <Path d="M43 70 Q46.5 66 50 69 Q53.5 72 57 68" {...line} strokeWidth={2.6} />
        </>
      );
    case 'kiss':
      return (
        <>
          {closed}
          {cheeks(7.5, 4.6, 0.75)}
          <Path d="M49 61 Q55 62.5 50.5 65 Q55 67.5 49 69" {...line} strokeWidth={2.8} />
          <Path d={heartAt(64, 70, 3.6)} fill="#E5627F" />
        </>
      );
    case 'shy':
      return (
        <>
          {closed}
          {cheeks(9.5, 5.8, 0.85)}
          <Path d="M22 61 l-2 5 M27 61 l-2 5 M32 61 l-2 5 M70 61 l-2 5 M75 61 l-2 5 M80 61 l-2 5" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
          <Path d="M45 66 Q47.5 63.5 50 66 Q52.5 68.5 55 66" {...line} strokeWidth={2.6} />
        </>
      );
    default:
      return null;
  }
}

const SIMPLE: BlobMood[] = ['normal', 'happy', 'sleepy'];

/** 平涂的小爱心（带一点高光） */
export function FlatHeart({ size = 24, color = '#F27B96' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21.2s-7.7-4.7-9.8-9.4C.7 8.5 2.7 4.3 6.6 4.3c2.3 0 3.7 1.3 5.4 3.3 1.7-2 3.1-3.3 5.4-3.3 3.9 0 5.9 4.2 4.4 7.5-2.1 4.7-9.8 9.4-9.8 9.4z" fill={color} />
      <Ellipse cx="7.4" cy="8.6" rx="1.7" ry="1.1" fill="#FFFFFF" opacity={0.55} transform="rotate(-30 7.4 8.6)" />
    </Svg>
  );
}

/**
 * 软糯的团子小人。who='her' 头上有蝴蝶结，who='him' 头上有小芽。
 * 会自己眨眼、上下轻轻晃。
 */
export function Blob({
  who = 'her',
  size = 80,
  mood = 'normal',
  bob = true,
  lean = 0,
  delay = 0,
  style,
}: {
  who?: 'her' | 'him';
  size?: number;
  mood?: BlobMood;
  bob?: boolean;
  lean?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const eye = useSharedValue(5);
  const y = useSharedValue(0);

  useEffect(() => {
    // 眨眼：每隔几秒闭一下
    eye.set(withDelay(delay + 1200, withRepeat(withSequence(withDelay(2600 + (who === 'him' ? 700 : 0), withTiming(0.6, { duration: 70 })), withTiming(5, { duration: 110 })), -1)));
    if (bob) y.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [eye, y, bob, delay, who]);

  const eyeProps = useAnimatedProps(() => ({ ry: eye.value }));
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * y.value }, { rotate: `${lean}deg` }, { scaleY: 1 - 0.03 * (1 - y.value) }, { scaleX: 1 + 0.03 * (1 - y.value) }],
  }));
  const color = who === 'her' ? mascot.her : mascot.him;

  return (
    <Animated.View style={[{ width: size, height: size, transformOrigin: 'bottom' }, body, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* 头顶装饰 */}
        {who === 'her' ? (
          <>
            <Path d="M66 20 L56 12 Q53 18 56 24 Z" fill="#F27B96" />
            <Path d="M66 20 L77 13 Q80 19 76 25 Z" fill="#F27B96" />
            <Ellipse cx="66" cy="19.5" rx="3.6" ry="3.4" fill="#E5627F" />
          </>
        ) : (
          <>
            <Path d="M50 18 Q49 11 51 6" stroke="#79B572" strokeWidth={3} strokeLinecap="round" fill="none" />
            <Path d="M51 9 Q58 2 64 7 Q58 13 51 9 Z" fill="#8FC488" />
            <Path d="M50 11 Q43 5 38 10 Q44 15 50 11 Z" fill="#8FC488" />
          </>
        )}
        {/* 身体 */}
        <Path d="M50 16 C77 16 92 38 92 62 C92 84 74 93 50 93 C26 93 8 84 8 62 C8 38 23 16 50 16 Z" fill={color} />
        <Ellipse cx="34" cy="36" rx="7" ry="4" fill="#FFFFFF" opacity={0.45} transform="rotate(-30 34 36)" />
        {SIMPLE.includes(mood) ? (
          <>
          {/* 眼睛 */}
          {mood === 'happy' ? (
            <>
              <Path d="M33 56 Q38 50 43 56" stroke={mascot.eye} strokeWidth={3.2} strokeLinecap="round" fill="none" />
              <Path d="M57 56 Q62 50 67 56" stroke={mascot.eye} strokeWidth={3.2} strokeLinecap="round" fill="none" />
            </>
          ) : mood === 'sleepy' ? (
            <>
              <Path d="M33 55 Q38 59 43 55" stroke={mascot.eye} strokeWidth={3.2} strokeLinecap="round" fill="none" />
              <Path d="M57 55 Q62 59 67 55" stroke={mascot.eye} strokeWidth={3.2} strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <AnimatedEllipse cx="38" cy="54" rx="4.2" animatedProps={eyeProps} fill={mascot.eye} />
              <AnimatedEllipse cx="62" cy="54" rx="4.2" animatedProps={eyeProps} fill={mascot.eye} />
            </>
          )}
          {/* 腮红 + 嘴 */}
          <Ellipse cx="27" cy="64" rx="7" ry="4.2" fill={mascot.cheek} opacity={0.55} />
          <Ellipse cx="73" cy="64" rx="7" ry="4.2" fill={mascot.cheek} opacity={0.55} />
          <Path d="M45 63 Q50 68 55 63" stroke={mascot.eye} strokeWidth={2.8} strokeLinecap="round" fill="none" />
          </>
        ) : (
          <Face mood={mood} />
        )}
      </Svg>
    </Animated.View>
  );
}

/** 从中间慢慢冒出来的小爱心（循环） */
function RisingHeart({ i, size }: { i: number; size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(i * 900, withRepeat(withTiming(1, { duration: 2700, easing: Easing.out(Easing.quad) }), -1)));
  }, [p, i]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : 1 - (p.value - 0.15) / 0.85,
    transform: [{ translateY: -size * 0.9 * p.value }, { translateX: Math.sin(p.value * Math.PI * 2 + i) * size * 0.08 }, { scale: 0.6 + p.value * 0.5 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, style]}>
      <FlatHeart size={size * 0.22} color={['#F27B96', '#F9B4C4', '#E5627F'][i % 3]} />
    </Animated.View>
  );
}

/** 两个靠在一起的小人，中间冒小爱心 */
export function BlobCouple({ size = 160, hearts = true, mood = 'normal', me, partner }: { size?: number; hearts?: boolean; mood?: BlobMood; me?: User | null; partner?: User | null }) {
  const b = size * 0.56;
  return (
    <View style={{ width: size, height: b * 1.15, alignItems: 'center', justifyContent: 'flex-end' }}>
      {hearts && (
        <View style={{ position: 'absolute', top: b * 0.15, alignSelf: 'center', width: 1, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <RisingHeart key={i} i={i} size={size} />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Blob who={mascotFor(me) ?? 'him'} size={b} lean={-6} mood={mood} />
        <Blob who={mascotFor(partner) ?? 'her'} size={b} lean={6} mood={mood} delay={400} style={{ marginLeft: -b * 0.16 }} />
      </View>
    </View>
  );
}
