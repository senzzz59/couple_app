import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { reminderPlans } from './reminderPlans';
import type { Anniversary, Capsule, Todo } from './types';

/**
 * 本地提醒：纪念日 / 节日 / 待办截止。每次数据变化时整体重排（iOS 最多 64 条，取最近的）。
 * 本地通知不依赖推送服务，国内安卓也能正常收到。
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const foregroundNudge = notification.request.content.data?.type === 'nudge' && AppState.currentState === 'active';
    return {
      shouldShowBanner: !foregroundNudge,
      shouldShowList: !foregroundNudge,
      shouldPlaySound: !foregroundNudge,
      shouldSetBadge: false,
    };
  },
});

const supported = Platform.OS !== 'web';

export async function ensurePermission() {
  if (!supported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: '提醒', importance: Notifications.AndroidImportance.HIGH });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

let scheduleQueue = Promise.resolve();
export function rescheduleAll(anns: Anniversary[], todos: Todo[], startDate?: string | null, capsules: Capsule[] = []) {
  const task = scheduleQueue.catch(() => {}).then(() => scheduleAll(anns, todos, startDate, capsules));
  scheduleQueue = task;
  return task;
}

export function cancelReminders() {
  const task = scheduleQueue.catch(() => {}).then(async () => {
    if (supported) await Notifications.cancelAllScheduledNotificationsAsync();
  });
  scheduleQueue = task;
  return task;
}

async function scheduleAll(anns: Anniversary[], todos: Todo[], startDate?: string | null, capsules: Capsule[] = []) {
  if (!supported || !(await ensurePermission())) return;
  const upcoming = reminderPlans(anns, todos, startDate, capsules);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of upcoming) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: 'default' },
    });
  }
}

/** 收到戳一戳时，App 在后台也弹一个本地通知 */
export async function notifyNow(title: string, body: string) {
  if (!supported) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null });
}
