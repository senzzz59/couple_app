import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** 触感只用在“状态确认”的时刻：发送、勾选、轮盘停下、点赞 */
const on = Platform.OS !== 'web';
export const haptic = {
  tap: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  soft: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  medium: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warn: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  tick: () => on && Haptics.selectionAsync(),
};
