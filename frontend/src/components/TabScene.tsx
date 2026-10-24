import type { ReactNode } from 'react';

/** 手机 App 里标签页的显示 / 隐藏交给原生，这里什么都不用做（网页见 TabScene.web.tsx） */
export function TabScene({ children }: { children: ReactNode }) {
  return children;
}
