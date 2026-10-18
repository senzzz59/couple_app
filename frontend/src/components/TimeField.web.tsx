import { Clock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Txt } from './ui';

export type TimeFieldProps = { value: string; active: boolean; onChange: (hhmm: string) => void };

/**
 * 自定义时间：外观和其它时间选项一样的小胶囊，上面盖一个透明的系统时间输入框，
 * 手指点到的就是输入框，手机上直接弹出系统的时间滚轮 / 时钟。
 */
export function TimeField({ value, active, onChange }: TimeFieldProps) {
  return (
    <View style={[styles.chip, active && styles.on]}>
      <Clock size={14} color={active ? colors.white : colors.inkSoft} />
      <Txt v="secondary" style={{ fontWeight: '600' }} color={active ? colors.white : colors.inkSoft}>
        {active ? value : '自定义'}
      </Txt>
      <input
        type="time"
        aria-label="自定义时间"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        // 电脑浏览器点在输入框上不会自己弹出选择器
        onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.02, color: 'transparent', background: 'transparent', fontSize: 16, border: 0, padding: 0, margin: 0, cursor: 'pointer' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  on: { backgroundColor: colors.ink, borderColor: colors.ink },
});
