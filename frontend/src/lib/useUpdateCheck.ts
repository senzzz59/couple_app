import { useState } from 'react';

import { toast } from '@/components/motion';

import { appUpdates, updatesEnabled, useAppUpdates } from './updates';

/** 「检查更新」：有新版就下载并刷新，没有就提示已是最新 */
export function useUpdateCheck() {
  const update = useAppUpdates();
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!updatesEnabled()) return toast('开发版不检查更新');
    setBusy(true);
    try {
      if (update.pending || (await appUpdates.check(true))) {
        if (!(await appUpdates.install())) toast(appUpdates.getState().error ?? '更新没装上，再试一次', '⚠️');
      } else {
        const error = appUpdates.getState().error;
        toast(error ? '检查失败，联网后再试' : '已经是最新版本', error ? '⚠️' : '✓');
      }
    } finally {
      setBusy(false);
    }
  };
  return { pending: !!update.pending, busy, check };
}
