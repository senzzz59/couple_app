import { useIsFocused } from 'expo-router';
import { ReactNode, useEffect, useRef } from 'react';

/**
 * 网页上的一个标签页。网页没有原生页面容器，打开过的标签页会一直叠在一起：
 * 看不见的几页照样排版、绘制，切换时还要逐帧挪动两整页，所以很卡。
 * 这里把切走的页面交给浏览器跳过（content-visibility: hidden，保留滚动位置和已经排好的版），
 * 切回来时只做一次很短的淡入。
 */
export function TabScene({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const ref = useRef<HTMLDivElement>(null);
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) ref.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    wasFocused.current = focused;
  }, [focused]);
  return (
    <div
      ref={ref}
      inert={!focused}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, ...(focused ? null : { visibility: 'hidden', contentVisibility: 'hidden' }) }}>
      {children}
    </div>
  );
}
