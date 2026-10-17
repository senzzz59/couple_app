import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollViewProps, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

import { usePullRefresh } from './PullRefresh';
import { LoadError, Skeleton } from './Skeleton';
import { TAB_BAR_HEIGHT } from './TabBar';
import { IconButton, Row, Txt } from './ui';

/** 电脑上宽屏浏览时内容居中，不拉满整个窗口 */
export const CENTERED = { width: '100%', maxWidth: 720, alignSelf: 'center' } as const;

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
  const pullRefresh = usePullRefresh(onRefresh, y, insets.top + 8);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
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
        {...pullRefresh.touchProps}
        refreshControl={pullRefresh.refreshControl}
        contentContainerStyle={[{ paddingTop: insets.top + (back ? 56 : 12), paddingBottom: (tab ? TAB_BAR_HEIGHT + 24 : 24) + insets.bottom, paddingHorizontal: 16 }, CENTERED, contentStyle]}>
        {title && (
          <Animated.View style={[{ marginBottom: 16, paddingHorizontal: 4, transformOrigin: 'left' }, big]}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                {subtitle && <Txt v="label">{subtitle}</Txt>}
                <Txt v="title" style={{ fontSize: 32, lineHeight: 40 }}>
                  {title}
                </Txt>
              </View>
              {right}
            </Row>
          </Animated.View>
        )}
        {children}
      </Animated.ScrollView>

      {pullRefresh.indicator}
      {/* 滚动后出现的毛玻璃顶栏 */}
      <Animated.View pointerEvents="none" style={[styles.topBar, { height: insets.top + 48 }, bar]}>
        <BlurView intensity={50} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,246,240,0.75)' }]} />
        <Txt v="bodyStrong" style={{ marginBottom: 14 }}>
          {title}
        </Txt>
      </Animated.View>
      {back && (
        <View style={{ position: 'absolute', top: insets.top + 6, left: 12 }}>
          <IconButton icon={ChevronLeft} onPress={goBack} label="返回" />
        </View>
      )}
    </View>
  );
}

/** 弹出式表单页的外壳：标题 + 关闭 + 右上角保存 */
export function SheetScreen({ title, children, action, onClose }: { title: string; children: ReactNode; action?: ReactNode; onClose?: () => void }) {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 12 : insets.top + 8;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={[{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 8, justifyContent: 'space-between' }, CENTERED]}>
        <IconButton icon={X} onPress={onClose ?? goBack} bg={colors.surfaceAlt} size={40} label="关闭" />
        <Txt v="bodyStrong">{title}</Txt>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{action}</View>
      </Row>
      <Animated.ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, paddingBottom: insets.bottom + 40, gap: 18 }, CENTERED]}>
        {children}
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 编辑页在读取已有内容时的占位：保留关闭按钮，失败时可以重试 */
export function SheetLoading({ title, q }: { title: string; q: { error: string | null; refresh: () => Promise<unknown> } }) {
  return (
    <SheetScreen title={title}>
      {q.error ? (
        <LoadError message={q.error} onRetry={q.refresh} />
      ) : (
        <View style={{ gap: 14 }}>
          <Skeleton w={80} h={12} />
          <Skeleton h={52} r={20} />
          <Skeleton w={80} h={12} style={{ marginTop: 8 }} />
          <Skeleton h={96} r={20} />
        </View>
      )}
    </SheetScreen>
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
