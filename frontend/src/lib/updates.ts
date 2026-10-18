import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createUpdateController } from './updateController';

export const updatesEnabled = () => Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
export const appUpdates = createUpdateController({
  enabled: updatesEnabled,
  check: Updates.checkForUpdateAsync,
  fetch: Updates.fetchUpdateAsync,
  reload: () => Updates.reloadAsync(),
});

export const useAppUpdates = () => useSyncExternalStore(appUpdates.subscribe, appUpdates.getState, appUpdates.getState);
export const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0';
export const updateVersion = Updates.updateId?.slice(0, 8);
export const buildInfo = { commit: null as string | null, builtAt: null as string | null };
/** 更新记录每一条的版本号：App 里没有构建信息，用记录里写的版本 */
export const releaseVersions: Record<string, string> = {};
