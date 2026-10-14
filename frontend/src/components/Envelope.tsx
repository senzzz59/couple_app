import { Heart } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { interpolate, SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

export const envelopeColors = {
  body: '#FFE3EA',
  flap: '#FFCFDB',
  pocket: '#FFF0F4',
  edge: '#F6B8C8',
  seal: '#FF6F91',
};

/**
 * 手绘信封。progress：0 封着 → 1 封口翻开 → 2 信纸抽出。
 * seal：火漆印 1 显示 / 0 消失（盖章、拆封动画用）。
 */
export function Envelope({ width, progress, seal }: { width: number; progress?: SharedValue<number>; seal?: SharedValue<number> }) {
  const fallbackP = useSharedValue(0);
  const fallbackSeal = useSharedValue(1);
  const p = progress ?? fallbackP;
  const s = seal ?? fallbackSeal;
  const W = width;
  const H = Math.round(width * 0.64);
  const flapH = H * 0.56;

  // 封口：前半段从 1 压扁到 0（向上翻），后半段在信纸后面从 0 展开到 -1（朝上）
  const flapFront = useAnimatedStyle(() => ({
    opacity: p.value < 0.5 ? 1 : 0,
    transform: [{ scaleY: interpolate(p.value, [0, 0.5], [1, 0], 'clamp') }],
  }));
  const flapBack = useAnimatedStyle(() => ({
    opacity: p.value >= 0.5 ? 1 : 0,
    transform: [{ scaleY: interpolate(p.value, [0.5, 1], [0, -1], 'clamp') }],
  }));
  // 封着的时候信纸会从封口和口袋的缝里露出来，所以等封口翻开一半再出现
  const letter = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.35, 0.6], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(p.value, [1, 2], [0, -H * 0.72], 'clamp') }],
  }));
  const sealStyle = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: interpolate(s.value, [0, 1], [1.8, 1]) }, { rotate: `${interpolate(s.value, [0, 1], [-25, 0])}deg` }],
  }));

  const sealSize = W * 0.2;
  return (
    <View style={{ width: W, height: H }}>
      {/* 背面 */}
      <Svg width={W} height={H} style={{ position: 'absolute' }}>
        <Rect x={0} y={0} width={W} height={H} rx={W * 0.04} fill={envelopeColors.body} />
      </Svg>

      {/* 翻开后朝上的封口（在信纸后面） */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: W, height: flapH, transformOrigin: 'top' }, flapBack]}>
        <Svg width={W} height={flapH}>
          <Path d={`M0 0 L${W} 0 L${W / 2} ${flapH} Z`} fill={envelopeColors.flap} />
        </Svg>
      </Animated.View>

      {/* 信纸 */}
      <Animated.View
        style={[
          { position: 'absolute', left: W * 0.08, top: H * 0.34, width: W * 0.84, height: H * 0.62, backgroundColor: colors.white, borderRadius: W * 0.02, padding: W * 0.06 },
          letter,
        ]}>
        <Svg width="100%" height="100%">
          {[0.18, 0.36, 0.54, 0.72].map((y) => (
            <Line key={y} x1="0" x2={y === 0.72 ? '55%' : '100%'} y1={`${y * 100}%`} y2={`${y * 100}%`} stroke={colors.line} strokeWidth={2} strokeLinecap="round" />
          ))}
        </Svg>
      </Animated.View>

      {/* 前面的口袋 */}
      <Svg width={W} height={H} style={{ position: 'absolute' }} pointerEvents="none">
        <Path
          d={`M0 ${H * 0.36} L${W / 2} ${H * 0.68} L${W} ${H * 0.36} L${W} ${H - W * 0.04} Q${W} ${H} ${W - W * 0.04} ${H} L${W * 0.04} ${H} Q0 ${H} 0 ${H - W * 0.04} Z`}
          fill={envelopeColors.pocket}
        />
        <Path d={`M0 ${H} L${W / 2} ${H * 0.62} L${W} ${H}`} stroke={envelopeColors.edge} strokeWidth={1.2} fill="none" opacity={0.6} />
      </Svg>

      {/* 封着时的封口 */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: W, height: flapH, transformOrigin: 'top' }, flapFront]}>
        <Svg width={W} height={flapH}>
          <Path d={`M0 0 L${W} 0 L${W / 2} ${flapH} Z`} fill={envelopeColors.flap} stroke={envelopeColors.edge} strokeWidth={1} />
        </Svg>
      </Animated.View>

      {/* 火漆印 */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: W / 2 - sealSize / 2,
            top: flapH - sealSize * 0.62,
            width: sealSize,
            height: sealSize,
            borderRadius: sealSize / 2,
            backgroundColor: envelopeColors.seal,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: sealSize * 0.07,
            borderColor: '#F2557C',
          },
          sealStyle,
        ]}>
        <Heart size={sealSize * 0.42} color="#FFFFFF" fill="#FFFFFF" />
      </Animated.View>
    </View>
  );
}
