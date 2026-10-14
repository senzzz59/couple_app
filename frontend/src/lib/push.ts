import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { ensurePermission } from './notify';

let registeredToken: string | null = null;
let generation = 0;
let registration: Promise<boolean> | null = null;

export function registerPush() {
  if (!registration) {
    registration = doRegisterPush(generation).finally(() => { registration = null; });
  }
  return registration;
}

async function doRegisterPush(startedGeneration: number) {
  if (Platform.OS === 'web' || !Device.isDevice || Constants.executionEnvironment === 'storeClient') return false;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId || !(await ensurePermission())) return false;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (startedGeneration !== generation) return false;
  await api.put('/api/push-token', { token: data });
  registeredToken = data;
  return true;
}

export async function unregisterPush() {
  generation++;
  await registration?.catch(() => {});
  const token = registeredToken;
  registeredToken = null;
  if (token) await api.deletePushToken(token);
}
