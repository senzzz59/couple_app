import { ReactNode, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, radius, springs } from '@/theme';

const OFFSCREEN = 700;
// 面板底部多垫一截，往上拖过头时不会露出空隙
const OVERDRAG = 40;

/**
 * 底部弹层：弹上来、背景渐暗；点背景、按返回、或者把它往下拖都能关掉，关的时候也有动画。
 * visible 变成 false 后先播放收起动画，再真正卸载。
 */
export function Sheet({
  visible,
  onClose,
  children,
  dragAnywhere = true,
  dismissable = true,
  style,
  onClosed,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 整个面板都能往下拖；里面有可滚动内容时设为 false，只拖顶部把手 */
  dragAnywhere?: boolean;
  /** false 时点背景 / 下拖不会关闭（比如正在保存） */
  dismissable?: boolean;
  style?: StyleProp<ViewStyle>;
  /** 收起动画播完、弹层完全关掉之后（焦点也已经还回页面） */
  onClosed?: () => void;
}) {
  const [mounted, setMounted] = useState(visible);
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });
  const wasMounted = useRef(mounted);
  useEffect(() => {
    if (wasMounted.current && !mounted) requestAnimationFrame(() => closed.current?.());
    wasMounted.current = mounted;
  }, [mounted]);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismissable && onClose()}>
      {mounted && (
        <SheetBody visible={visible} onClose={onClose} onHidden={() => setMounted(false)} dragAnywhere={dragAnywhere} dismissable={dismissable} style={style}>
          {children}
        </SheetBody>
      )}
    </Modal>
  );
}

function SheetBody({
  visible,
  onClose,
  onHidden,
  children,
  dragAnywhere,
  dismissable,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  onHidden: () => void;
  children: ReactNode;
  dragAnywhere: boolean;
  dismissable: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(OFFSCREEN);
  const [h, setH] = useState(OFFSCREEN);
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  });

  useEffect(() => {
    if (visible) {
      y.set(withSpring(0, { ...springs.soft, damping: 20 }));
      return;
    }
    const done = () => hidden.current();
    y.set(
      withTiming(h + OVERDRAG, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(done);
      })
    );
  }, [visible, y, h]);

  const requestClose = () => onClose();
  const pan = Gesture.Pan()
    .enabled(dismissable)
    .activeOffsetY(8)
    .failOffsetY(-8)
    .failOffsetX([-24, 24])
    .onChange((e) => {
      // 往下拖跟手，往上拖有阻尼
      const next = y.get() + e.changeY;
      y.set(next < 0 ? Math.max(-OVERDRAG + 6, next * 0.5) : next);
    })
    .onEnd((e) => {
      if (y.get() > Math.min(140, h * 0.3) || e.velocityY > 900) scheduleOnRN(requestClose);
      else y.set(withSpring(0, springs.snappy));
    });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, Math.max(1, h)], [1, 0], 'clamp') }));

  const handle = (
    <View style={styles.handleArea}>
      <View style={styles.handle} />
    </View>
  );

  const body = (
    <Animated.View
      onLayout={(e) => setH(e.nativeEvent.layout.height - OVERDRAG)}
      style={[styles.sheet, { paddingBottom: insets.bottom + 20 + OVERDRAG }, sheet]}>
      {dragAnywhere ? handle : <GestureDetector gesture={pan}>{handle}</GestureDetector>}
      <View style={[{ gap: 16, flexShrink: 1 }, style]}>{children}</View>
    </Animated.View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable accessibilityLabel="关闭" style={StyleSheet.absoluteFill} onPress={() => dismissable && requestClose()} />
      </Animated.View>
      {dragAnywhere ? <GestureDetector gesture={pan}>{body}</GestureDetector> : body}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(75,46,53,0.32)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -OVERDRAG,
    maxHeight: '90%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    gap: 12,
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6, marginHorizontal: -20 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint },
});
