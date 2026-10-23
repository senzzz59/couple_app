import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ReleaseTimeline } from '@/components/ReleaseNotes';
import { Screen } from '@/components/Screen';
import { Group, SettingRow } from '@/components/SettingsList';
import { Button, Txt } from '@/components/ui';
import { RELEASES } from '@/lib/changelog';
import { appVersion, buildInfo } from '@/lib/updates';
import { useUpdateCheck } from '@/lib/useUpdateCheck';
import { colors, fonts } from '@/theme';

const CHANGELOG_ROUTE = '/settings/changelog' as Href;

const fmtBuilt = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 屏幕信息：页面显示大小不对时截图给开发者看（连点版本号 5 下才出现） */
function screenInfo() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  const vv = window.visualViewport;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return [
    `inner ${window.innerWidth}×${window.innerHeight}`,
    `client ${document.documentElement.clientWidth}×${document.documentElement.clientHeight}`,
    `screen ${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    `visual ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} ×${vv.scale.toFixed(2)}` : '-'}`,
    `root ${document.getElementById('root')?.offsetWidth ?? '-'}×${document.getElementById('root')?.offsetHeight ?? '-'}`,
    `主屏幕模式 ${standalone ? '是' : '否'}`,
    `viewport ${document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '-'}`,
    navigator.userAgent,
  ];
}

/** 安卓手机用浏览器打开时，提供 App 安装包下载（服务器上的 /download/us.apk） */
const androidWeb = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export default function About() {
  const update = useUpdateCheck();
  const [taps, setTaps] = useState(0);
  const [info, setInfo] = useState<string[] | null>(null);
  return (
    <Screen back title="关于">
      <View style={styles.hero}>
        <Image source={require('@/assets/images/icon.png')} style={styles.icon} />
        <Txt style={{ fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink }}>us.</Txt>
      </View>
      <View style={{ gap: 24 }}>
        <Group>
          <SettingRow
            first
            label="版本"
            value={appVersion}
            onPress={() => {
              const n = taps + 1;
              setTaps(n);
              if (n >= 5) setInfo(screenInfo());
            }}
          />
          {buildInfo.builtAt && <SettingRow label="发布时间" value={fmtBuilt(buildInfo.builtAt)} />}
          {buildInfo.commit && <SettingRow label="提交" value={buildInfo.commit} />}
          {androidWeb && <SettingRow label="安卓 App" value="下载安装包" onPress={() => window.location.assign('/download/us.apk')} />}
        </Group>
        {info && (
          <View style={styles.info}>
            {info.map((line) => (
              <Txt key={line} v="caption" selectable style={{ fontSize: 11 }}>
                {line}
              </Txt>
            ))}
          </View>
        )}
        <Button title={update.pending ? '更新到新版本' : '检查更新'} variant={update.pending ? 'primary' : 'secondary'} loading={update.busy} onPress={update.check} />
        <View style={{ gap: 12 }}>
          <Txt v="heading" style={{ paddingHorizontal: 4 }}>
            更新记录
          </Txt>
          <ReleaseTimeline releases={RELEASES.slice(0, 3)} currentVersion={appVersion} />
          {RELEASES.length > 3 && <Button title="查看全部更新记录" variant="ghost" onPress={() => router.push(CHANGELOG_ROUTE)} />}
        </View>
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
  info: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 2 },
});
