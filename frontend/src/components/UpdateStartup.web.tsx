import { useEffect, useState } from 'react';

import { hasKept, restoreAfterUpdate } from '@/lib/keep';
import { openUpdateSheet, setPendingRestore } from '@/lib/updateFlow';
import { appUpdates, registerWebsite } from '@/lib/updates.web';

import { toast } from './motion';

/**
 * 网页版启动：
 * - 刚刚「立即更新」刷新过：先取回之前的页面层级和填写内容，再显示页面（最多等 3 秒）
 * - 之后定期检查新版本，有新版本就在顶部提示，点一下打开「发现新版本」
 */
export function useUpdateStartup() {
  const [ready, setReady] = useState(() => !hasKept());
  useEffect(() => {
    if (ready) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const timer = setTimeout(finish, 3000);
    void restoreAfterUpdate()
      .then(setPendingRestore)
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    void registerWebsite();
    let alive = true;
    let announced = false;
    const check = async () => {
      const pending = await appUpdates.check();
      if (alive && pending && !announced) {
        announced = true;
        toast('有新版本可以更新', '', undefined, { onPress: openUpdateSheet, action: { label: '查看', onPress: openUpdateSheet }, duration: 6000 });
      }
    };
    void check();
    const foreground = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const online = () => void check();
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('online', online);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('online', online);
    };
  }, []);
  return ready;
}
