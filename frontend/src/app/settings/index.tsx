import { router } from 'expo-router';
import { Bell, CalendarHeart, ChevronRight, Download, Eye, Heart, Info, KeyRound, LogOut, Package, Smartphone } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Group, SettingRow } from '@/components/SettingsList';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, enter, PressScale, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { fmtFullDate } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { isIOS, isStandalone, promptInstall } from '@/lib/install';
import { ensurePermission } from '@/lib/notify';
import { registerPush } from '@/lib/push';
import { enableWebPush, testWebPush, webPushState, type WebPushState } from '@/lib/webPush';
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

  // 网页版的后台通知（添加到主屏幕后）
  const [pushState, setPushState] = useState<WebPushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const refreshPush = useCallback(() => {
    if (web) webPushState().then(setPushState).catch(() => setPushState('unsupported'));
  }, [web]);
  useEffect(refreshPush, [refreshPush]);
  const PUSH_LABEL: Record<WebPushState, string> = { on: '已开启', off: '未开启', denied: '已关闭', 'needs-install': '需添加到主屏幕', unsupported: '不支持' };
  const webNotifications = async () => {
    if (pushState === 'needs-install') return setInstallGuide(true);
    if (pushState === 'unsupported') return toast('这个浏览器收不到后台通知', '⚠️', isIOS() ? '需要 iOS 16.4 以上，从主屏幕图标打开' : '安卓需要手机有谷歌服务，或换用 App 版');
    if (pushState === 'denied') return toast('通知权限被关掉了', '⚠️', isIOS() ? '去「设置 → 通知 → us.」里打开' : '在浏览器的网站设置里允许 us. 发通知');
    setPushBusy(true);
    try {
      if (pushState === 'on') {
        if (!(await confirm('通知已开启', 'TA 发动态、评论、点赞、戳你时，App 没开着也会提醒你。发一条测试通知看看？', '发送', { tone: 'normal' }))) return;
        const r = await testWebPush();
        toast(r.ok ? '已发送，看看通知栏' : '没发出去，稍后再试', r.ok ? '🔔' : '⚠️');
        return;
      }
      const next = await enableWebPush();
      setPushState(next);
      if (next === 'on') {
        haptic.success();
        toast('通知已开启', '🔔', 'TA 发动态、评论、戳你时会提醒你');
        testWebPush().catch(() => {});
      } else if (next === 'denied') toast('没有通知权限', '⚠️', isIOS() ? '去「设置 → 通知 → us.」里打开' : '在浏览器的网站设置里允许');
    } catch (e) {
      toast((e as Error).message || '开启失败，稍后再试', '⚠️');
    } finally {
      setPushBusy(false);
    }
  };

  // 相册里让 TA 看到我在看哪张（默认开）
  const [shareViewing, setShareViewing] = useState<boolean | null>(null);
  const sharing = shareViewing ?? me?.shareViewing !== false;
  const toggleShareViewing = async (next: boolean) => {
    haptic.tick();
    setShareViewing(next);
    try {
      await api.patch('/api/me', { shareViewing: next });
      invalidate('me');
    } catch (e) {
      setShareViewing(!next);
      toast((e as Error).message, '⚠️');
    }
  };

  // 网页版：下载安卓 App 安装包（服务器上的 /download/us.apk），iPhone 暂时没有 App 版
  const downloadApp = async () => {
    if (isIOS()) return toast('iPhone 暂时不支持 App 版', '🍎', '继续用 Safari 添加到主屏幕就好');
    // 服务器配了对象存储时给的是对象存储的链接，下载快很多；没有就用服务器上的 /download/us.apk
    const info = await fetch('/api/app/android', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (info?.url) return window.location.assign(info.url);
    const ready = await fetch('/download/android.json', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
    if (!ready) return toast('安装包还没准备好，稍后再试', '⚠️');
    window.location.assign('/download/us.apk');
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
            <SettingRow icon={Heart} label="我们的空间" value={partner?.name ?? undefined} badge={partner ? undefined : '邀请 TA'} onPress={() => router.push('/settings/space')} />
            <SettingRow
              icon={Eye}
              label="让 TA 看到我在看哪张照片"
              right={<Switch value={sharing} onValueChange={toggleShareViewing} trackColor={{ true: colors.accent, false: colors.faint }} thumbColor={colors.white} />}
            />
          </Group>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <Group title="账号">
            <SettingRow first icon={KeyRound} label="修改密码" onPress={() => router.push('/settings/password')} />
            {!web && <SettingRow icon={Bell} label="提醒通知" onPress={enableNotifications} />}
            {web && <SettingRow icon={Bell} label="消息通知" value={pushState ? PUSH_LABEL[pushState] : undefined} badge={pushState === 'off' ? '去开启' : undefined} busy={pushBusy || !pushState} onPress={webNotifications} />}
          </Group>
        </Animated.View>

        <Animated.View entering={enter(3)}>
          <Group title="应用">
            {web && !isStandalone() && <SettingRow first icon={Smartphone} label="添加到主屏幕" onPress={install} />}
            {web && <SettingRow first={isStandalone()} icon={Package} label="下载 App 版" value={isIOS() ? undefined : '安卓'} onPress={downloadApp} />}
            <SettingRow first={!web} icon={Download} label={update.pending ? '更新到新版本' : '检查更新'} value={update.pending ? undefined : appVersion} badge={update.pending ? '新版本' : undefined} busy={update.busy} onPress={update.check} />
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
        {pushState === 'needs-install' && <Txt v="secondary">iPhone 要先把 us. 添加到主屏幕，从主屏幕图标打开后才能开启消息通知。</Txt>}
        {(isIOS()
          ? ['点浏览器的「分享」按钮（Chrome 在地址栏右边）', '选择「添加到主屏幕」', '以后从主屏幕的 us. 图标打开']
          : ['打开 Chrome 右上角的 ⋮ 菜单', '选择「添加到主屏幕」→「安装」，不要选「创建快捷方式」（快捷方式图标会带 Chrome 小角标）']
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
