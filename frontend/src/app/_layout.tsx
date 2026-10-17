import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ConfirmHost } from '@/components/Confirm';
// 尽早监听浏览器的「安装应用」事件
import '@/lib/install';
import { ConfettiHost, toast, ToastHost } from '@/components/motion';
import { useUpdateStartup } from '@/components/UpdateStartup';
import { haptic } from '@/lib/haptics';
import { notifyNow, rescheduleAll } from '@/lib/notify';
import { NUDGES } from '@/lib/nudge';
import { subscribeNudgeNotifications } from '@/lib/nudgeNotifications';
import { SessionProvider, useCouple, useSession } from '@/lib/session';
import type { NudgeEvent } from '@/lib/session';
import { useQuery } from '@/lib/store';
import type { Anniversary, Capsule, Todo } from '@/lib/types';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/** 数据变化时重排本地提醒 */
function ReminderSync() {
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const todos = useQuery<Todo[]>('/api/todos');
  const capsules = useQuery<Capsule[]>('/api/capsules');
  const { space } = useCouple();
  useEffect(() => {
    if (!anns.data || !todos.data) return;
    const t = setTimeout(() => rescheduleAll(anns.data!, todos.data!, space?.startDate, capsules.data ?? []).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [anns.data, todos.data, space?.startDate, capsules.data]);
  return null;
}

function NudgeListener() {
  const { onNudge } = useSession();
  const { partner } = useCouple();
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const receive = (e: NudgeEvent) => {
      const key = e.id ?? `${e.from}|${e.at}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
      const n = NUDGES[e.kind] ?? NUDGES.poke;
      const who = partner?.name || 'TA';
      haptic.heavy();
      setTimeout(() => haptic.heavy(), 180);
      toast(`${who} ${n.text}`, n.emoji, undefined, { showEmoji: true });
      if (AppState.currentState !== 'active' && !e.remotePush) notifyNow(`${n.emoji} ${who}`, n.text);
    };
    const off = onNudge(receive);
    const unsubscribeNotifications = subscribeNudgeNotifications(receive);
    return () => { off(); unsubscribeNotifications(); };
  }, [onNudge, partner?.name]);
  return null;
}

function RootStack({ fontsLoaded }: { fontsLoaded: boolean }) {
  const updateReady = useUpdateStartup();
  const { status } = useSession();
  const ready = fontsLoaded && status !== 'loading' && updateReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const modal = { presentation: 'modal' as const, animation: 'slide_from_bottom' as const };
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="place/[id]" />
          <Stack.Screen name="anniversaries" />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/about" />
          <Stack.Screen name="settings/profile" options={modal} />
          <Stack.Screen name="settings/password" options={modal} />
          <Stack.Screen name="roulette" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="capsules" />
          <Stack.Screen name="capsule/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="capsule/new" options={modal} />
          <Stack.Screen name="footprints" />
          <Stack.Screen name="album/[id]" />
          <Stack.Screen name="album/add" options={modal} />
          <Stack.Screen name="question" options={modal} />
          <Stack.Screen name="place/edit" options={modal} />
          <Stack.Screen name="visit/new" options={modal} />
          <Stack.Screen name="moment/new" options={modal} />
          <Stack.Screen name="todo/new" options={modal} />
          <Stack.Screen name="anniversary/edit" options={modal} />
          <Stack.Screen name="viewer" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      {status === 'signedIn' && (
        <>
          <ReminderSync />
          <NudgeListener />
        </>
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    UsRounded_Bold: require('@/assets/fonts/UsRounded-Bold.ttf'),
    UsRounded_Medium: require('@/assets/fonts/UsRounded-Medium.ttf'),
  });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <RootStack fontsLoaded={fontsLoaded || !!fontError} />
        </View>
        <ConfettiHost />
        <ConfirmHost />
        <ToastHost />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
