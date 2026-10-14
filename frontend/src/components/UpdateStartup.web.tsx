import { useEffect } from 'react';
import { toast } from './motion';
import { appUpdates, registerWebsite } from '@/lib/updates.web';

export function useUpdateStartup() {
  useEffect(() => {
    void registerWebsite();
    let alive = true;
    let announced = false;
    const check = async () => {
      const pending = await appUpdates.check();
      if (alive && pending && !announced) {
        announced = true;
        toast('网页有新版本，到「我的」页面刷新即可更新', '✨');
      }
    };
    void check();
    const foreground = () => { if (document.visibilityState === 'visible') void check(); };
    const online = () => { void check(); };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('online', online);
    return () => { alive = false; document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', online); };
  }, []);
  return true;
}
