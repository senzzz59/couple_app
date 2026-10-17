import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { CalendarHeart, Camera, House, Images, ListChecks, LucideIcon, Mail, Plus, Sparkles, Store, UtensilsCrossed, ImagePlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { uploadToGallery } from '@/lib/galleryUpload';
import { haptic } from '@/lib/haptics';
import { colors, radius, shadow, springs } from '@/theme';

import { toast } from './motion';
import { PressScale, Txt } from './ui';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: '首页' },
  moments: { icon: Sparkles, label: '动态' },
  gallery: { icon: Images, label: '相册' },
  eats: { icon: UtensilsCrossed, label: '美食' },
  todos: { icon: ListChecks, label: '清单' },
};

type QuickAction = { icon: LucideIcon; label: string; bg: string; run: () => void };

const ACTIONS: QuickAction[] = [
  { icon: Camera, label: '发动态', bg: colors.pink, run: () => router.push('/moment/new') },
  {
    icon: ImagePlus,
    label: '传照片到相册',
    bg: colors.peach,
    run: () => {
      // 先在点击里打开文件选择（浏览器要求），再切到相册页看进度
      uploadToGallery().catch((e) => toast((e as Error).message, '⚠️'));
      router.navigate('/gallery');
    },
  },
  { icon: Store, label: '收藏好店', bg: colors.pink, run: () => router.push('/place/edit') },
  { icon: ListChecks, label: '加个待办', bg: colors.peach, run: () => router.push('/todo/new') },
  { icon: CalendarHeart, label: '纪念日', bg: colors.pink, run: () => router.push('/anniversary/edit') },
  { icon: Mail, label: '时光胶囊', bg: colors.peach, run: () => router.push('/capsule/new') },
];

export const TAB_BAR_HEIGHT = 64;
const FAB = 58;

function Action({ a, i, open, onPick }: { a: QuickAction; i: number; open: boolean; onPick: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = open ? withDelay(i * 40, withSpring(1, springs.bouncy)) : withTiming(0, { duration: 140 });
  }, [open, i, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 36 }, { scale: 0.6 + 0.4 * p.value }] }));
  const Icon = a.icon;
  return (
    <Animated.View style={[anim, { alignSelf: 'flex-end' }]}>
      <PressScale
        onPress={() => {
          onPick();
          a.run();
        }}
        style={styles.action}>
        <Txt v="bodyStrong">{a.label}</Txt>
        <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
          <Icon size={20} color={colors.ink} strokeWidth={2.2} />
        </View>
      </PressScale>
    </Animated.View>
  );
}

/** 一个标签：选中时变宽、露出文字，背后有一块粉色的胶囊 */
function Tab({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const tab = TABS[name];
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, springs.soft);
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

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const rowW = Math.min(width - 24, 480);

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
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="关闭">
            <BlurView intensity={30} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,247,245,0.75)' }]} />
          </Pressable>
        </Animated.View>
      )}
      <View pointerEvents={open ? 'box-none' : 'none'} style={{ position: 'absolute', bottom: bottom + TAB_BAR_HEIGHT + 18, width: rowW, alignSelf: 'center', gap: 10 }}>
        {[...ACTIONS].reverse().map((a, i) => (
          <Action key={a.label} a={a} i={ACTIONS.length - 1 - i} open={open} onPick={() => setOpen(false)} />
        ))}
      </View>

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
                  setOpen(false);
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
        <PressScale
          scaleTo={0.88}
          onPress={() => {
            haptic.medium();
            setOpen((o) => !o);
          }}
          style={styles.fab}
          accessibilityLabel="快速添加">
          <Animated.View style={fab}>
            <Plus size={28} color={colors.white} strokeWidth={2.6} />
          </Animated.View>
        </PressScale>
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
  fab: { width: FAB, height: FAB, borderRadius: FAB / 2, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center', ...shadow },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingRight: 10,
    paddingLeft: 20,
    borderRadius: radius.pill,
    ...shadow,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
