/** 原生 App 本身就在主屏幕上（网页版见 install.web.ts） */
export const isStandalone = () => true;
export const isIOS = () => false;
export async function promptInstall(): Promise<'installed' | 'dismissed' | 'manual'> {
  return 'installed';
}
