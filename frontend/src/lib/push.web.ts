import { api } from './api';
import { isIOS, isStandalone } from './install';
import { registerWebsite } from './updates';

/**
 * 网页推送：添加到主屏幕后，App 关着也能收到 TA 的动态、评论、戳一戳。
 * - iPhone / iPad：iOS 16.4 以上，必须从主屏幕图标打开，并在设置里点「开启」（系统要求由点击触发）
 * - 安卓 / 电脑 Chrome：浏览器支持即可。国内安卓手机的 Chrome 推送走谷歌服务，没有谷歌服务时收不到
 */
export type WebPushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const supported = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function webPushState(): Promise<WebPushState> {
  if (!supported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await registerWebsite();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** 确保正在运行的是带推送功能的新版 Service Worker（旧版不会显示通知，iOS 会因此取消订阅） */
async function activeWorker() {
  const reg = await registerWebsite();
  if (!reg) throw new Error('这个浏览器不支持后台通知');
  await reg.update().catch(() => {});
  const pending = reg.installing ?? reg.waiting;
  if (pending) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 8000);
      const step = () => {
        if (pending.state === 'installed') pending.postMessage({ type: 'SKIP_WAITING' });
        if (pending.state === 'activated' || pending.state === 'redundant') {
          clearTimeout(timer);
          resolve();
        }
      };
      pending.addEventListener('statechange', step);
      step();
    });
  }
  return navigator.serviceWorker.ready;
}

function keyBytes(base64: string) {
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribe(reg: ServiceWorkerRegistration) {
  const { publicKey } = await api.get<{ publicKey: string }>('/api/web-push/key');
  let sub = await reg.pushManager.getSubscription();
  // 服务器换过密钥时旧订阅不能用，重新订阅
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey.replace(/=+$/, '')) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.put('/api/web-push/subscription', sub.toJSON());
  return sub;
}

/** 设置里点「开启」时调用：弹系统权限框并订阅。返回最新状态 */
export async function enableWebPush(): Promise<WebPushState> {
  if (!supported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  // iOS 只认点击后立刻发起的权限请求：前面不能先 await 别的
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  try {
    await subscribe(await activeWorker());
  } catch (e) {
    // 安卓 Chrome 订阅要连谷歌的推送服务，国内没有谷歌服务时会在这里失败
    if ((e as Error).name === 'AbortError' || /push service/i.test((e as Error).message)) {
      throw new Error(isIOS() ? '连不上推送服务，稍后再试' : '这台手机连不上 Chrome 的推送服务（国内安卓通常没有谷歌服务）');
    }
    throw e;
  }
  return 'on';
}

export async function disableWebPush() {
  if (!supported()) return;
  const reg = await registerWebsite();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.deleteWebPush(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testWebPush() {
  return api.post<{ ok: boolean }>('/api/web-push/test');
}

/** 打开 App 时：已经开启过就把订阅重新登记一下（换了账号、服务器清过数据都能恢复）。从不弹权限框 */
export async function registerPush() {
  if (!supported() || Notification.permission !== 'granted') return false;
  const reg = await registerWebsite();
  if (!reg || !(await reg.pushManager.getSubscription())) return false;
  await subscribe(await navigator.serviceWorker.ready);
  return true;
}

/** 退出登录：这台设备不再收这个账号的通知 */
export async function unregisterPush() {
  await disableWebPush();
}
