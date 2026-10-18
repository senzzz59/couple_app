/**
 * 更新时「原样保留」页面和正在填的内容：网页版见 keep.web.ts。
 * App 里更新由系统在下次打开时装上，不需要保存。
 */
export function keepValue(_key: string, _get: () => unknown) {
  return () => {};
}
export function keptValue<T>(_key: string): T | undefined {
  return undefined;
}
export async function saveForUpdate(_nav: unknown, _from: string | null) {}
export function hasKept() {
  return false;
}
export async function restoreAfterUpdate(): Promise<{ nav: unknown; from: string | null } | null> {
  return null;
}
