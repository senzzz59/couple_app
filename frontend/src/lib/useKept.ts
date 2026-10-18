import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { keepValue, keptValue } from './keep';

/**
 * 和 useState 一样，但「立即更新」刷新页面后会自动还原（正在填的文字、选项、刚选的照片）。
 * key 要能区分不同的表单，比如 `todo:${id ?? 'new'}:title`；传 null 表示不保留。
 */
export function useKept<T>(key: string | null, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const kept = key ? keptValue<T>(key) : undefined;
    if (kept !== undefined) return kept;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => (key ? keepValue(key, () => latest.current) : undefined), [key]);
  return [value, setValue];
}
