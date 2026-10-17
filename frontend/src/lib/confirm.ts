import { Alert, Platform } from 'react-native';

export type ConfirmRequest = {
  title: string;
  message: string;
  okText: string;
  cancelText: string;
  /** danger：红色按钮，用于删除；normal：普通确认 */
  tone: 'danger' | 'normal';
  resolve: (ok: boolean) => void;
};

type Listener = (req: ConfirmRequest) => void;
let host: Listener | null = null;

/** 由 ConfirmHost 注册；没有挂载时退回系统对话框 */
export function setConfirmHost(l: Listener | null) {
  host = l;
}

/** 跨平台确认框：优先用 App 里的底部弹层，和整体风格一致 */
export function confirm(title: string, message: string, okText = '删除', opts: { cancelText?: string; tone?: 'danger' | 'normal' } = {}): Promise<boolean> {
  const cancelText = opts.cancelText ?? '再想想';
  const tone = opts.tone ?? 'danger';
  if (host) {
    const show = host;
    return new Promise((resolve) => show({ title, message, okText, cancelText, tone, resolve }));
  }
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: tone === 'danger' ? 'destructive' : 'default', onPress: () => resolve(true) },
    ])
  );
}
