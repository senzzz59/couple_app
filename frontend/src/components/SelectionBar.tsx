import { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow } from '@/theme';

import { TAB_BAR_HEIGHT } from './TabBar';
import { PressScale, Txt } from './ui';

export type SelectionAction = { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean; disabled?: boolean };

/** 多选时浮在底部的操作条 */
export function SelectionBar({ count, actions, aboveTabs }: { count: number; actions: SelectionAction[]; aboveTabs?: boolean }) {
  const insets = useSafeAreaInsets();
  const bottom = (aboveTabs ? TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 14 : insets.bottom + 16);
  return (
    <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown.duration(180)} style={[styles.wrap, { bottom }]}>
      <View style={styles.bar}>
        {actions.map((a) => (
          <PressScale key={a.label} disabled={a.disabled || count === 0} onPress={a.onPress} style={[styles.action, (a.disabled || count === 0) && { opacity: 0.35 }]}>
            <a.icon size={20} color={a.danger ? colors.pinkInk : colors.ink} />
            <Txt v="caption" style={{ fontSize: 11 }} color={a.danger ? colors.pinkInk : colors.inkSoft}>
              {a.label}
            </Txt>
          </PressScale>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 6, justifyContent: 'space-around', ...shadow },
  action: { alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, minWidth: 56 },
});
