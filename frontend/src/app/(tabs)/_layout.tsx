import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { TabScene } from '@/components/TabScene';
import { colors } from '@/theme';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  // freezeOnBlur：切走的标签页不再跟着实时消息重新渲染，切回来再更新
  // 网页上左右滑动的切换动画要在主线程逐帧挪两整页，改成 TabScene 里的短淡入
  return (
    <Tabs
      tabBar={(p) => <TabBar {...p} />}
      screenLayout={({ children }) => <TabScene>{children}</TabScene>}
      screenOptions={{ headerShown: false, animation: web ? 'none' : 'shift', freezeOnBlur: true, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="moments" />
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="eats" />
      <Tabs.Screen name="todos" />
    </Tabs>
  );
}
