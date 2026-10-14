export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'restarting' | 'error' | 'unsupported';
export type UpdateState = { phase: UpdatePhase; pending: boolean; lastChecked: number | null; error: string | null };
type UpdateResult = { isAvailable: boolean; isRollBackToEmbedded?: boolean };
type FetchResult = { isNew: boolean; isRollBackToEmbedded?: boolean };

export function createUpdateController(adapter: {
  enabled: () => boolean;
  check: () => Promise<UpdateResult>;
  fetch: () => Promise<FetchResult>;
  reload: () => Promise<void>;
}, now = Date.now) {
  let state: UpdateState = { phase: 'idle', pending: false, lastChecked: null, error: null };
  let operation: Promise<boolean> | null = null;
  let reloadOperation: Promise<boolean> | null = null;
  let lastAutomaticCheck: number | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function performCheck() {
    set({ phase: 'checking', error: null });
    try {
      const result = await adapter.check();
      set({ lastChecked: now() });
      if (!result.isAvailable && !result.isRollBackToEmbedded) {
        set({ phase: 'idle' });
        return false;
      }
      set({ phase: 'downloading' });
      const downloaded = await adapter.fetch();
      const pending = downloaded.isNew || downloaded.isRollBackToEmbedded === true;
      set({ phase: pending ? 'ready' : 'idle', pending });
      return pending;
    } catch {
      set({ phase: 'error', error: '更新检查或下载失败，请检查网络后重试' });
      return false;
    }
  }

  function check(manual = false): Promise<boolean> {
    if (!adapter.enabled()) {
      set({ phase: 'unsupported' });
      return Promise.resolve(false);
    }
    if (reloadOperation) return reloadOperation;
    if (operation) return operation;
    if (state.pending) return Promise.resolve(true);
    if (!manual && lastAutomaticCheck !== null && now() - lastAutomaticCheck < 15 * 60_000) return Promise.resolve(false);
    if (!manual) lastAutomaticCheck = now();
    operation = performCheck().finally(() => { operation = null; });
    return operation;
  }

  function install(): Promise<boolean> {
    if (reloadOperation) return reloadOperation;
    if (!state.pending || !adapter.enabled()) return Promise.resolve(false);
    set({ phase: 'restarting', error: null });
    reloadOperation = adapter.reload().then(() => true).catch(() => {
      set({ phase: 'ready', error: '更新已下载，重启失败，可以再试一次' });
      return false;
    }).finally(() => { reloadOperation = null; });
    return reloadOperation;
  }

  return {
    check, install,
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
