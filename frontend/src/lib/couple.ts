import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { api, getBaseUrl } from './api';
import { invalidate } from './store';

export type CoupleInfo = { id: string; inviteCode: string | null; startDate: string | null; title: string | null; members: number };

/** 邀请码 8 位：显示成 ABCD-EFGH 好念好抄 */
export const INVITE_LENGTH = 8;
export const formatInviteCode = (code: string) => (code.length === INVITE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code);
export const cleanInviteCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_LENGTH);

/** 配对状态变了：自己、另一半和所有共享数据都要重新拉 */
export function refreshPairing() {
  for (const c of ['me', 'couple', 'space']) invalidate(c);
}

export const coupleApi = {
  create: () => api.post<{ couple: CoupleInfo }>('/api/couple'),
  join: (code: string, leaveCurrent = false) => api.post<{ couple: CoupleInfo }>('/api/couple/join', { code, leaveCurrent }),
  newCode: () => api.post<{ couple: CoupleInfo }>('/api/couple/invite'),
  leave: (password: string) => api.post('/api/couple/leave', { password }),
  deleteAccount: (password: string) => api.post('/api/account/delete', { password }),
};

/** 发给 TA：系统分享面板，不支持时复制到剪贴板。返回 'copied' 表示复制了 */
export async function shareInvite(code: string): Promise<'shared' | 'copied'> {
  const link = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : getBaseUrl();
  const message = `我在 us. 建好了我们的小空间～注册后填邀请码 ${formatInviteCode(code)} 就能和我连在一起 💗${link ? `\n${link}` : ''}`;
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);
  if (canShare) {
    try {
      await Share.share({ message });
      return 'shared';
    } catch (e) {
      // 用户自己取消了就算了；浏览器不让分享时退回复制
      if ((e as Error)?.name === 'AbortError') return 'shared';
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}
