import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bike, Car, Footprints, TrainFront } from 'lucide-react-native';
import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { hasCoordinates, type MapDestination, type NavMode } from '@/lib/amap';
import { openInMaps } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Sheet } from './Sheet';
import { PressScale, Txt } from './ui';

const OPTIONS: { mode: NavMode; label: string; Icon: typeof Car }[] = [
  { mode: 'walking', label: '步行', Icon: Footprints },
  { mode: 'cycling', label: '骑行', Icon: Bike },
  { mode: 'transit', label: '公交地铁', Icon: TrainFront },
  { mode: 'driving', label: '开车', Icon: Car },
];
const LAST_KEY = 'nav.lastMode';

// ---------- 全局只挂一个选择面板（在根布局里），任何页面调用 chooseTravel 都会弹出来
let target: MapDestination | null = null;
let lastMode: NavMode | null = null;
const listeners = new Set<() => void>();
const set = (next: MapDestination | null) => {
  target = next;
  listeners.forEach((l) => l());
};

/** 导航到某个地方：先问怎么去（没有坐标的老店铺只能在高德里搜索，直接打开） */
export function chooseTravel(p: MapDestination) {
  if (!hasCoordinates(p)) {
    openInMaps(p).catch(() => toast('打不开高德地图', '⚠️'));
    return;
  }
  set(p);
}

/** 直接按某种方式导航（比如在「要多久」里点了步行那一格） */
export function navigateBy(p: MapDestination, mode: NavMode) {
  lastMode = mode;
  void AsyncStorage.setItem(LAST_KEY, mode).catch(() => {});
  openInMaps(p, mode).catch(() => toast('打不开高德地图', '⚠️'));
}

export function TravelPickerHost() {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => target
  );
  useEffect(() => {
    AsyncStorage.getItem(LAST_KEY)
      .then((m) => {
        if (m && OPTIONS.some((o) => o.mode === m)) lastMode = m as NavMode;
      })
      .catch(() => {});
  }, []);
  return (
    <Sheet visible={!!p} onClose={() => set(null)} style={{ gap: 14 }}>
      <Txt v="heading">怎么去？</Txt>
      <View style={styles.grid}>
        {OPTIONS.map(({ mode, label, Icon }) => {
          const last = lastMode === mode;
          return (
            <PressScale
              key={mode}
              scaleTo={0.95}
              accessibilityLabel={`${label}去`}
              onPress={() => {
                haptic.tick();
                // 必须在点击里直接打开：浏览器（尤其 iPhone Safari）只允许用户点击时唤起别的 App
                if (target) navigateBy(target, mode);
                set(null);
              }}
              style={[styles.option, last && styles.optionLast]}>
              <View style={[styles.icon, last && { backgroundColor: colors.accentStrong }]}>
                <Icon size={22} color={last ? colors.white : colors.ink} />
              </View>
              <Txt v="bodyStrong" style={{ flex: 1 }}>
                {label}
              </Txt>
            </PressScale>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  optionLast: { borderColor: colors.accentStrong },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
