import { useState } from 'react';

import { toast } from '@/components/motion';

import { checkApkUpdate } from './apkUpdate';
import { openUpdateSheet } from './updateFlow';
import { appUpdates, updatesEnabled, useAppUpdates } from './updates';

/** 「检查更新」：有新版就打开「发现新版本」弹窗（看更新内容、立即更新），没有就提示已是最新 */
export function useUpdateCheck() {
  const update = useAppUpdates();
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!updatesEnabled()) return toast('开发版不检查更新');
    if (update.pending) return openUpdateSheet();
    setBusy(true);
    try {
      // 原生部分变了：热更新装不上，先看有没有新安装包（有就弹出下载）
      if (await checkApkUpdate(true)) return;
      if (await appUpdates.check(true)) openUpdateSheet();
      else {
        const error = appUpdates.getState().error;
        toast(error ? '检查失败，联网后再试' : '已经是最新版本', error ? '⚠️' : '✓');
      }
    } finally {
      setBusy(false);
    }
  };
  return { pending: !!update.pending, busy, check };
}
