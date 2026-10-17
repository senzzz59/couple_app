import { ChevronRight, LucideIcon } from 'lucide-react-native';
import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { PressScale, Txt } from './ui';

/** 设置里的一组：可选的小标题 + 白色圆角卡片 */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      {title && (
        <Txt v="secondary" style={{ paddingHorizontal: 16 }}>
          {title}
        </Txt>
      )}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/** 一行设置：图标 + 名称，右侧是当前值 / 角标 / 箭头 */
export function SettingRow({
  icon: Icon,
  label,
  value,
  onPress,
  danger,
  badge,
  busy,
  first,
}: {
  icon?: LucideIcon;
  label: string;
  value?: string | null;
  onPress?: () => void;
  danger?: boolean;
  badge?: string;
  busy?: boolean;
  first?: boolean;
}) {
  const content = (
    <>
      {Icon && <Icon size={20} color={danger ? colors.danger : colors.inkSoft} strokeWidth={1.8} />}
      <Txt v="body" style={{ flex: 1 }} color={danger ? colors.danger : colors.ink} numberOfLines={1}>
        {label}
      </Txt>
      {badge && (
        <View style={styles.badge}>
          <Txt v="secondary" color={colors.white} style={{ fontSize: 12, lineHeight: 16 }}>
            {badge}
          </Txt>
        </View>
      )}
      {busy ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : value ? (
        <Txt v="secondary" numberOfLines={1} style={{ maxWidth: '50%' }}>
          {value}
        </Txt>
      ) : null}
      {onPress && !danger && <ChevronRight size={18} color={colors.faint} />}
    </>
  );
  const style = [styles.row, !first && styles.sep];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <PressScale haptics={false} scaleTo={0.98} onPress={onPress} disabled={busy} style={style}>
      {content}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  badge: { backgroundColor: colors.accentStrong, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
