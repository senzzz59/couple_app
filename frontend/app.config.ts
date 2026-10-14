import type { ConfigContext, ExpoConfig } from 'expo/config';

export function configureApp({ config }: ConfigContext): ExpoConfig {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId;
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EAS 项目 ID 格式不正确');
  }
  return {
    ...config,
    name: config.name ?? 'us.',
    slug: config.slug ?? 'us-couple',
    runtimeVersion: { policy: 'fingerprint' },
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
    updates: {
      ...config.updates,
      enabled: !!projectId,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
  };
}

export default configureApp;
