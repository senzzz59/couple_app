import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import type { NudgeEvent } from './session';

export function subscribeNudgeNotifications(receive: (event: NudgeEvent) => void) {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (AppState.currentState === 'active' && data?.type === 'nudge' && typeof data.kind === 'string' && typeof data.from === 'string' && typeof data.at === 'string') {
      receive({ kind: data.kind, from: data.from, at: data.at, id: typeof data.id === 'string' ? data.id : undefined, remotePush: true });
    }
  });
  return () => subscription.remove();
}
