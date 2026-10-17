import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 触感只用在“状态确认”的时刻：发送、勾选、轮盘停下、点赞。
 * 网页版：安卓浏览器用 navigator.vibrate；iPhone Safari 没有震动接口，
 * 借用 iOS 18 起「开关」控件自带的轻触感（不支持的浏览器什么都不会发生）。
 */
const web = Platform.OS === 'web';

type Strength = 'tick' | 'tap' | 'medium' | 'heavy' | 'success' | 'warn';
const VIBRATE: Record<Strength, number | number[]> = {
  tick: 6,
  tap: 10,
  medium: 18,
  heavy: 28,
  success: [12, 60, 18],
  warn: [24, 50, 24],
};

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
  const doc = globalThis.document;
  if (!doc?.body) return;
  // 正在打字时不触发：点 label 会让输入框失焦、键盘收起
  const active = doc.activeElement as HTMLElement | null;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  if (!iosSwitch) {
    const label = doc.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    doc.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

const isIOSWeb = () => {
  const nav = globalThis.navigator;
  if (!nav) return false;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
};

function webHaptic(kind: Strength) {
  try {
    const nav = globalThis.navigator;
    if (nav && typeof nav.vibrate === 'function') {
      nav.vibrate(VIBRATE[kind]);
      return;
    }
    if (!isIOSWeb()) return;
    iosTick();
    // 成功 / 警告用两下轻触区分
    if (kind === 'success' || kind === 'warn' || kind === 'heavy') setTimeout(iosTick, 90);
  } catch {
    // 触感只是锦上添花，失败就算了
  }
}

const native = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  soft: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  tick: () => Haptics.selectionAsync(),
};

export const haptic = {
  tap: () => (web ? webHaptic('tap') : native.tap()),
  soft: () => (web ? webHaptic('tick') : native.soft()),
  medium: () => (web ? webHaptic('medium') : native.medium()),
  heavy: () => (web ? webHaptic('heavy') : native.heavy()),
  success: () => (web ? webHaptic('success') : native.success()),
  warn: () => (web ? webHaptic('warn') : native.warn()),
  tick: () => (web ? webHaptic('tick') : native.tick()),
};
