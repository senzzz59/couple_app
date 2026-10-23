import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { House, Images, ListChecks, LucideIcon, Sparkles, UtensilsCrossed } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { colors, radius, shadow } from '@/theme';

import { Txt } from './ui';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: '首页' },
  moments: { icon: Sparkles, label: '动态' },
  gallery: { icon: Images, label: '相册' },
  eats: { icon: UtensilsCrossed, label: '美食' },
  todos: { icon: ListChecks, label: '清单' },
};

export const TAB_BAR_HEIGHT = 64;

/** 一个标签：选中时变宽、露出文字，背后有一块粉色的胶囊 */
function Tab({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const tab = TABS[name];
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    // 短一点、不回弹：宽度动画每帧都要重新排版，和页面切换同时结束才不会卡
    p.value = withTiming(focused ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [focused, p]);
  const grow = useAnimatedStyle(() => ({ flexGrow: 1 + p.value * 1.1 }));
  const pill = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleX: 0.6 + 0.4 * p.value }, { scaleY: 0.8 + 0.2 * p.value }] }));
  const Icon = tab.icon;
  return (
    <Animated.View style={[{ flexBasis: 0, height: '100%' }, grow]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} onPress={onPress} style={styles.tab}>
        <Animated.View style={[styles.pill, pill]} />
        {/* 包一层 View：网页上图标要叠在胶囊背景上面 */}
        <View>
          <Icon size={21} color={focused ? colors.pinkInk : colors.muted} strokeWidth={focused ? 2.4 : 2} />
        </View>
        {focused && (
          <Animated.View entering={FadeIn.duration(180).delay(60)} exiting={FadeOut.duration(80)}>
            <Txt numberOfLines={1} style={{ fontSize: 13, fontWeight: '700' }} color={colors.pinkInk}>
              {tab.label}
            </Txt>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** 打开 App 一会儿后，在后台把没打开过的标签页先渲染好：第一次切过去不用现搭整个页面 */
const PRELOAD_AFTER_MS = 1500;
const PRELOAD_GAP_MS = 400;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const names = state.routes.map((r) => r.name).filter((n, i) => i !== state.index && TABS[n]);
    names.forEach((name, i) => timers.push(setTimeout(() => navigation.preload(name), PRELOAD_AFTER_MS + i * PRELOAD_GAP_MS)));
    return () => timers.forEach(clearTimeout);
    // 只在启动时预加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rowW = Math.min(width - 24, 440);
  const bottom = Math.max(insets.bottom, 12);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: TAB_BAR_HEIGHT + bottom + 8 }}>
      <View style={[styles.row, { width: rowW, bottom }]}>
        <View style={styles.bar}>
          <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, styles.blur]} />
          {state.routes.map((route, index) => {
            if (!TABS[route.name]) return null;
            const focused = state.index === index;
            return (
              <Tab
                key={route.key}
                name={route.name}
                focused={focused}
                onPress={() => {
                  const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) {
                    haptic.tick();
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', alignSelf: 'center', height: TAB_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
    ...shadow,
  },
  blur: { borderRadius: radius.pill, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, overflow: 'hidden' },
  pill: { ...StyleSheet.absoluteFill, top: 8, bottom: 8, left: 2, right: 2, borderRadius: radius.pill, backgroundColor: colors.pink },
});
