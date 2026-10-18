/** 网页版的启动动画写在 HTML 里（见 launchScreen.ts），App 就绪后让它淡出 */
export function hideLaunch() {
  if (typeof window === 'undefined') return;
  (window as Window & { __usHideLaunch?: () => void }).__usHideLaunch?.();
}
