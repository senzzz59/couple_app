/** 网页「添加到主屏幕」：安卓 Chrome 可以直接弹出安装，iPhone 只能手动从分享菜单添加 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
  });
}

export function isStandalone() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
}

export const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** 能直接弹出安装就弹出，返回 manual 时需要给用户看手动步骤 */
export async function promptInstall(): Promise<'installed' | 'dismissed' | 'manual'> {
  if (!deferred) return 'manual';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome === 'accepted' ? 'installed' : 'dismissed';
}
