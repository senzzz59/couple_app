import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Group, SettingRow } from '@/components/SettingsList';
import { Button, Txt } from '@/components/ui';
import { appVersion, buildInfo } from '@/lib/updates';
import { useUpdateCheck } from '@/lib/useUpdateCheck';
import { colors, fonts } from '@/theme';

const fmtBuilt = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function About() {
  const update = useUpdateCheck();
  return (
    <Screen back title="关于">
      <View style={styles.hero}>
        <Image source={require('@/assets/images/icon.png')} style={styles.icon} />
        <Txt style={{ fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink }}>us.</Txt>
        <Txt v="secondary">版本 {appVersion}</Txt>
      </View>
      <View style={{ gap: 24 }}>
        <Group>
          <SettingRow first label="版本" value={appVersion} />
          {buildInfo.builtAt && <SettingRow label="发布时间" value={fmtBuilt(buildInfo.builtAt)} />}
          {buildInfo.commit && <SettingRow label="提交" value={buildInfo.commit} />}
        </Group>
        <Button title={update.pending ? '更新到新版本' : '检查更新'} variant={update.pending ? 'primary' : 'secondary'} loading={update.busy} onPress={update.check} />
        <Group title="字体">
          <SettingRow first label="思源柔黑 Resource Han Rounded" value="SIL OFL 1.1" />
          <SettingRow label="Nunito" value="SIL OFL 1.1" />
        </Group>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  icon: { width: 76, height: 76, borderRadius: 18, marginBottom: 8 },
});
