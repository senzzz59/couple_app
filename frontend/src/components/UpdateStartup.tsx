import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { appUpdates, updatesEnabled } from '@/lib/updates';

/** Apply startup updates before showing forms; slow downloads finish for the next launch. */
export function useUpdateStartup() {
  const [ready, setReady] = useState(!updatesEnabled());
  useEffect(() => {
    if (!updatesEnabled()) return;
    let startup = true;
    let mounted = true;
    const finish = () => { startup = false; if (mounted) setReady(true); };
    const timer = setTimeout(finish, 8000);
    void appUpdates.check().then(async (pending) => {
      if (pending && startup && AppState.currentState === 'active') await appUpdates.install();
    }).finally(() => { clearTimeout(timer); finish(); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        // Returning from the background must not interrupt a form already on screen.
        finish();
      } else if (!startup) {
        void appUpdates.check();
      }
    });
    return () => { mounted = false; startup = false; clearTimeout(timer); subscription.remove(); };
  }, []);
  return ready;
}
