import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  // freezeOnBlur：切走的标签页不再跟着实时消息重新渲染，切回来再更新
  return (
    <Tabs
      tabBar={(p) => <TabBar {...p} />}
      screenOptions={{ headerShown: false, animation: 'shift', freezeOnBlur: true, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="moments" />
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="eats" />
      <Tabs.Screen name="todos" />
    </Tabs>
  );
}
