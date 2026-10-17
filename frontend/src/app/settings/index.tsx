import { router } from 'expo-router';
import { Bell, CalendarHeart, ChevronRight, Download, Heart, Info, KeyRound, LogOut, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Group, SettingRow } from '@/components/SettingsList';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, enter, PressScale, Txt } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { fmtFullDate } from '@/lib/dates';
import { isIOS, isStandalone, promptInstall } from '@/lib/install';
import { ensurePermission } from '@/lib/notify';
import { registerPush } from '@/lib/push';
import { useCouple, useSession } from '@/lib/session';
import { invalidate } from '@/lib/store';
import { appVersion } from '@/lib/updates';
import { useUpdateCheck } from '@/lib/useUpdateCheck';
import { colors, radius } from '@/theme';

export default function Settings() {
  const { me, partner, space } = useCouple();
  const { signOut } = useSession();
  const update = useUpdateCheck();
  const [installGuide, setInstallGuide] = useState(false);
  const web = Platform.OS === 'web';

  const install = async () => {
    const r = await promptInstall();
    if (r === 'manual') setInstallGuide(true);
  };

  const enableNotifications = async () => {
    if (!(await ensurePermission())) return toast('没有通知权限，去系统设置里打开', '⚠️');
    for (const c of ['anniversaries', 'todos', 'capsules', 'space']) invalidate(c);
    await registerPush().catch(() => false);
    toast('提醒已开启');
  };

  const logout = async () => {
    if (await confirm('退出登录？', '', '退出')) signOut();
  };

  return (
    <Screen back title="设置">
      <View style={{ gap: 24 }}>
        <Animated.View entering={enter(0)}>
          <PressScale scaleTo={0.98} haptics={false} onPress={() => router.push('/settings/profile')} style={styles.profile}>
            <Avatar user={me} size={60} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="heading">{me?.name || '设置昵称'}</Txt>
              <Txt v="secondary" numberOfLines={1}>
                {me?.email}
              </Txt>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </PressScale>
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <Group title="我们">
            <SettingRow first icon={CalendarHeart} label="在一起的日子" value={space?.startDate ? fmtFullDate(space.startDate) : '未设置'} onPress={() => router.push('/anniversaries')} />
            <SettingRow icon={Heart} label="另一半" value={partner?.name ?? '还没加入'} />
          </Group>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <Group title="账号">
            <SettingRow first icon={KeyRound} label="修改密码" onPress={() => router.push('/settings/password')} />
            {!web && <SettingRow icon={Bell} label="提醒通知" onPress={enableNotifications} />}
          </Group>
        </Animated.View>

        <Animated.View entering={enter(3)}>
          <Group title="应用">
            {web && !isStandalone() && <SettingRow first icon={Smartphone} label="添加到主屏幕" onPress={install} />}
            <SettingRow first={!web || isStandalone()} icon={Download} label={update.pending ? '更新到新版本' : '检查更新'} value={update.pending ? undefined : appVersion} badge={update.pending ? '新版本' : undefined} busy={update.busy} onPress={update.check} />
            <SettingRow icon={Info} label="关于" onPress={() => router.push('/settings/about')} />
          </Group>
        </Animated.View>

        <Animated.View entering={enter(4)}>
          <Group>
            <SettingRow first icon={LogOut} label="退出登录" danger onPress={logout} />
          </Group>
        </Animated.View>
      </View>

      <Sheet visible={installGuide} onClose={() => setInstallGuide(false)}>
        <Txt v="heading">添加到主屏幕</Txt>
        {(isIOS()
          ? ['用 Safari 打开这个网页', '点底部的「分享」按钮', '选择「添加到主屏幕」']
          : ['打开浏览器右上角的菜单', '选择「安装应用」或「添加到主屏幕」']
        ).map((t, i) => (
          <View key={t} style={styles.step}>
            <View style={styles.stepNum}>
              <Txt v="bodyStrong" color={colors.white} style={{ fontSize: 14 }}>
                {i + 1}
              </Txt>
            </View>
            <Txt v="body">{t}</Txt>
          </View>
        ))}
        <Button title="知道了" variant="secondary" onPress={() => setInstallGuide(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
