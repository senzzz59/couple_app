import { Image } from 'expo-image';
import { LucideIcon } from 'lucide-react-native';
import { forwardRef, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { fileUrl } from '@/lib/api';
import { mascotFor } from '@/lib/profile';
import { Blob } from './Mascot';
import { haptic } from '@/lib/haptics';
import type { User } from '@/lib/types';
import { colors, fonts, radius, shadow, springs, type } from '@/theme';

// ---------- 文字
type Variant = keyof typeof type;
export function Txt({ v = 'body', color, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  const s = StyleSheet.flatten([type[v], color ? { color } : null, style]);
  // 系统字体上写了粗体 → 换成圆体（中文也圆圆的）
  if (!s.fontFamily && s.fontWeight && ['600', '700', '800', '900', 'bold'].includes(String(s.fontWeight))) {
    s.fontFamily = ['800', '900'].includes(String(s.fontWeight)) ? fonts.round : fonts.roundMedium;
  }
  // 自带字重的自定义字体不能再叠 fontWeight，否则安卓 / iOS 会退回系统字体
  if (s.fontFamily && s.fontWeight) delete s.fontWeight;
  return <Text {...p} style={s} />;
}

// ---------- 按下会回弹的容器：整个 App 统一的“果冻”手感
// 按下时横向微胖、纵向压扁，松手后像果冻一样晃回来
type PressScaleProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptics?: boolean;
  children?: ReactNode;
};
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function PressScale({ style, scaleTo = 0.95, haptics = true, onPressIn, onPressOut, onPress, children, ...p }: PressScaleProps) {
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleX: sx.value }, { scaleY: sy.value }] }));
  const squash = (1 - scaleTo) * 0.6;
  return (
    <AnimatedPressable
      {...p}
      onPressIn={(e) => {
        sx.set(withSpring(1 - squash * 0.3, springs.snappy));
        sy.set(withSpring(scaleTo, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        sx.set(withSpring(1, springs.bouncy));
        sy.set(withSpring(1, { ...springs.bouncy, stiffness: 300 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.tap();
        onPress?.(e);
      }}
      style={[style, anim]}>
      {children}
    </AnimatedPressable>
  );
}

// ---------- 卡片
export function Card({ style, children, bg = colors.surface, onPress, ...p }: PressScaleProps & { bg?: string }) {
  const s = [styles.card, { backgroundColor: bg }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <PressScale {...p} onPress={onPress} style={s}>
      {children}
    </PressScale>
  );
}

/** 列表 / 卡片依次入场 */
export const enter = (i = 0) => FadeInDown.delay(Math.min(i, 10) * 50).springify().damping(13).stiffness(170);

// ---------- 按钮
export function Button({
  title,
  onPress,
  icon: Icon,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.accentStrong, accent: colors.accentStrong, secondary: colors.surfaceAlt, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'accent' ? colors.white : colors.ink;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon && <Icon size={18} color={fg} strokeWidth={2.2} />}
          <Txt v="bodyStrong" color={fg}>
            {title}
          </Txt>
        </>
      )}
    </PressScale>
  );
}

export function IconButton({ icon: Icon, onPress, bg = colors.surface, color = colors.ink, size = 44, style, label }: { icon: LucideIcon; onPress?: () => void; bg?: string; color?: string; size?: number; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={label} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon size={size * 0.45} color={color} strokeWidth={2.2} />
    </PressScale>
  );
}

// ---------- 胶囊标签
export function Chip({ label, active, onPress, color = colors.ink }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.93} style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}>
      <Txt v="secondary" style={{ fontWeight: '600' }} color={active ? colors.white : colors.inkSoft}>
        {label}
      </Txt>
    </PressScale>
  );
}

// ---------- 头像：照片优先，已设置性别时显示对应团子，否则用名字首字
export function Avatar({ user, size = 40, ring }: { user?: User | null; size?: number; ring?: string }) {
  const who = mascotFor(user);
  const tint = who === 'him' ? colors.peach : who === 'her' ? colors.pink : colors.surfaceAlt;
  // 头像图片加载失败（文件丢了 / 网络不好）时退回团子或首字，不留一个空圆
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!user?.avatar && failed !== user.avatar;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: ring ? 2.5 : 0, borderColor: ring }}>
      {who && !showPhoto ? (
        <Blob who={who} size={size * 0.9} bob={false} />
      ) : !showPhoto ? (
        <Txt style={{ fontSize: size * 0.42, fontWeight: '700' }} color={colors.inkSoft}>
          {user?.name?.slice(0, 1) || '·'}
        </Txt>
      ) : null}
      {showPhoto && (
        <Image source={fileUrl(user!.avatar, true)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setFailed(user!.avatar)} />
      )}
    </View>
  );
}

// ---------- 输入框
export const Field = forwardRef<TextInput, TextInputProps & { label?: string; style?: StyleProp<ViewStyle> }>(function Field({ label, style, ...p }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label && (
        <Txt v="label" style={{ marginBottom: 8, marginLeft: 4 }}>
          {label}
        </Txt>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.faint}
        {...p}
        onFocus={(e) => {
          setFocused(true);
          p.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          p.onBlur?.(e);
        }}
        style={[styles.input, p.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }, focused && { borderColor: colors.accent }]}
      />
    </View>
  );
});

// ---------- 空状态
export function Empty({ title, hint, action }: { emoji?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <Animated.View entering={enter(1)} style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 }}>
      <View style={{ marginBottom: 8 }}>
        <Blob who={title.length % 2 ? 'her' : 'him'} size={84} mood="happy" />
      </View>
      <Txt v="heading" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {hint && (
        <Txt v="secondary" style={{ textAlign: 'center' }}>
          {hint}
        </Txt>
      )}
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </Animated.View>
  );
}

export function Row({ style, children, gap = 8 }: { style?: StyleProp<ViewStyle>; children: ReactNode; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 }} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 18, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, ...shadow },
  button: { height: 54, borderRadius: radius.pill, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    minHeight: 52,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
