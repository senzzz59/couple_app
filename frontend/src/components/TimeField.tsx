import { Clock } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Sheet } from './Sheet';
import { Chip, PressScale, Row, Txt } from './ui';

export type TimeFieldProps = { value: string; active: boolean; onChange: (hhmm: string) => void };

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** App 里的自定义时间：点开选小时和分钟 */
export function TimeField({ value, active, onChange }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':');
  return (
    <>
      <PressScale scaleTo={0.93} onPress={() => setOpen(true)} style={[styles.chip, active && styles.on]}>
        <Clock size={14} color={active ? colors.white : colors.inkSoft} />
        <Txt v="secondary" style={{ fontWeight: '600' }} color={active ? colors.white : colors.inkSoft}>
          {active ? value : '自定义'}
        </Txt>
      </PressScale>
      <Sheet visible={open} onClose={() => setOpen(false)} style={{ gap: 12 }}>
        <Txt v="heading">选个时间 · {value}</Txt>
        <Txt v="label">小时</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {HOURS.map((x) => (
            <Chip key={x} label={x} active={x === h} onPress={() => onChange(`${x}:${m}`)} />
          ))}
        </ScrollView>
        <Txt v="label">分钟</Txt>
        <View>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {MINUTES.map((x) => (
              <Chip key={x} label={x} active={x === m} onPress={() => onChange(`${h}:${x}`)} />
            ))}
          </Row>
        </View>
        <Chip label="好了" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  on: { backgroundColor: colors.ink, borderColor: colors.ink },
});
