import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { CalendarHeart, Camera, House, ListChecks, LucideIcon, Mail, Plus, Sparkles, Store, UtensilsCrossed } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { colors, radius, shadow, springs } from '@/theme';

import { PressScale, Txt } from './ui';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: '首页' },
  eats: { icon: UtensilsCrossed, label: '美食' },
  moments: { icon: Sparkles, label: '动态' },
  todos: { icon: ListChecks, label: '清单' },
};
// 5 个槽位，中间（2）是加号
const SLOT_OF = [0, 1, 3, 4];

const ACTIONS: { icon: LucideIcon; label: string; bg: string; href: string }[] = [
  { icon: Camera, label: '发动态', bg: colors.pink, href: '/moment/new' },
  { icon: Store, label: '收藏好店', bg: colors.peach, href: '/place/edit' },
  { icon: ListChecks, label: '加个待办', bg: colors.pink, href: '/todo/new' },
  { icon: CalendarHeart, label: '纪念日', bg: colors.peach, href: '/anniversary/edit' },
  { icon: Mail, label: '时光胶囊', bg: colors.pink, href: '/capsule/new' },
];

export const TAB_BAR_HEIGHT = 64;

function Action({ a, i, open, onPick }: { a: (typeof ACTIONS)[number]; i: number; open: boolean; onPick: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = open ? withDelay(i * 45, withSpring(1, springs.bouncy)) : withTiming(0, { duration: 140 });
  }, [open, i, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 40 }, { scale: 0.6 + 0.4 * p.value }] }));
  const Icon = a.icon;
  return (
    <Animated.View style={anim}>
      <PressScale
        onPress={() => {
          onPick();
          router.push(a.href as never);
        }}
        style={styles.action}>
        <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
          <Icon size={20} color={colors.ink} strokeWidth={2.2} />
        </View>
        <Txt v="bodyStrong">{a.label}</Txt>
      </PressScale>
    </Animated.View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const barW = Math.min(width - 32, 420);
  const slotW = barW / 5;

  const x = useSharedValue(SLOT_OF[state.index] * slotW);
  useEffect(() => {
    x.value = withSpring(SLOT_OF[state.index] * slotW, springs.soft);
  }, [state.index, slotW, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withSpring(open ? 1 : 0, springs.snappy);
  }, [open, rot]);
  const fab = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 135}deg` }] }));

  const bottom = Math.max(insets.bottom, 12);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: open ? height : TAB_BAR_HEIGHT + bottom + 8 }}>
      {open && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}>
            <BlurView intensity={30} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,246,240,0.7)' }]} />
          </Pressable>
        </Animated.View>
      )}
      <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', bottom: bottom + TAB_BAR_HEIGHT + 20, alignSelf: 'center', gap: 10 }}>
        {[...ACTIONS].reverse().map((a, i) => (
          <Action key={a.href} a={a} i={ACTIONS.length - 1 - i} open={open} onPick={() => setOpen(false)} />
        ))}
      </View>

      <View style={[styles.bar, { width: barW, bottom, alignSelf: 'center' }]}>
        <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, styles.blur]} />
        <Animated.View style={[styles.pillWrap, { width: slotW }, pill]}>
          <View style={styles.pill} />
        </Animated.View>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const Icon = tab.icon;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={[styles.tab, { left: SLOT_OF[index] * slotW, width: slotW }]}
              onPress={() => {
                setOpen(false);
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) {
                  haptic.tick();
                  navigation.navigate(route.name);
                }
              }}>
              <Icon size={22} color={focused ? colors.ink : colors.muted} strokeWidth={focused ? 2.4 : 2} />
              {focused && (
                <Animated.View entering={ZoomIn.springify().damping(14)}>
                  <Txt style={{ fontSize: 10, fontWeight: '700', marginTop: 2 }}>{tab.label}</Txt>
                </Animated.View>
              )}
            </Pressable>
          );
        })}
        <View style={[styles.tab, { left: 2 * slotW, width: slotW }]}>
          <PressScale
            scaleTo={0.88}
            onPress={() => {
              haptic.medium();
              setOpen((o) => !o);
            }}
            style={styles.fab}
            accessibilityLabel="快速添加">
            <Animated.View style={fab}>
              <Plus size={26} color={colors.white} strokeWidth={2.6} />
            </Animated.View>
          </PressScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
    ...shadow,
  },
  blur: { borderRadius: radius.pill, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)' },
  pillWrap: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 58, height: 48, borderRadius: radius.pill, backgroundColor: colors.pink },
  tab: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  fab: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 22,
    borderRadius: radius.pill,
    ...shadow,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
