import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollViewProps, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

import { TAB_BAR_HEIGHT } from './TabBar';
import { IconButton, Row, Txt } from './ui';

/** 直接打开深链接时没有上一页，回首页 */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * 大标题页面：向下滚动时大标题淡出、顶部出现毛玻璃小标题（iOS 风格）。
 */
export function Screen({
  title,
  subtitle,
  right,
  back,
  children,
  onRefresh,
  tab = false,
  contentStyle,
  ...scroll
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  tab?: boolean;
  contentStyle?: ScrollViewProps['contentContainerStyle'];
} & Omit<ScrollViewProps, 'children'>) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [30, 70], [0, 1], 'clamp') }));
  const big = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 50], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(y.value, [-100, 0], [1.08, 1], 'clamp') }, { translateY: interpolate(y.value, [-100, 0], [10, 0], 'clamp') }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.ScrollView
        {...scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.muted}
              onRefresh={async () => {
                setRefreshing(true);
                await onRefresh().catch(() => {});
                setRefreshing(false);
              }}
            />
          ) : undefined
        }
        contentContainerStyle={[{ paddingTop: insets.top + (back ? 56 : 12), paddingBottom: (tab ? TAB_BAR_HEIGHT + 24 : 24) + insets.bottom, paddingHorizontal: 16 }, contentStyle]}>
        {title && (
          <Animated.View style={[{ marginBottom: 16, paddingHorizontal: 4, transformOrigin: 'left' }, big]}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                {subtitle && <Txt v="label">{subtitle}</Txt>}
                <Txt v="title" style={{ fontSize: 34, lineHeight: 40 }}>
                  {title}
                </Txt>
              </View>
              {right}
            </Row>
          </Animated.View>
        )}
        {children}
      </Animated.ScrollView>

      {/* 滚动后出现的毛玻璃顶栏 */}
      <Animated.View pointerEvents="none" style={[styles.topBar, { height: insets.top + 48 }, bar]}>
        <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,246,240,0.75)' }]} />
        <Txt v="bodyStrong" style={{ marginBottom: 14 }}>
          {title}
        </Txt>
      </Animated.View>
      {back && (
        <View style={{ position: 'absolute', top: insets.top + 6, left: 12 }}>
          <IconButton icon={ChevronLeft} onPress={goBack} />
        </View>
      )}
    </View>
  );
}

/** 弹出式表单页的外壳：标题 + 关闭 + 右上角保存 */
export function SheetScreen({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 12 : insets.top + 8;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 8, justifyContent: 'space-between' }}>
        <IconButton icon={X} onPress={goBack} bg={colors.surfaceAlt} size={40} />
        <Txt v="bodyStrong">{title}</Txt>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{action}</View>
      </Row>
      <Animated.ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 18 }}>
        {children}
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    overflow: 'hidden',
  },
});
