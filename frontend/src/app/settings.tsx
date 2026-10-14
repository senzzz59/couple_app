import { router } from 'expo-router';
import { Bell, CalendarHeart, ChevronRight, Download, KeyRound, LogOut, LucideIcon, Server } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DatePicker } from '@/components/DatePicker';
import { toast } from '@/components/motion';
import { pickImages } from '@/components/Photos';
import { Screen } from '@/components/Screen';
import { WebSettings } from '@/components/WebSettings';
import { Avatar, Button, enter, Field, PressScale, Txt } from '@/components/ui';
import { api, getBaseUrl, uploadImages } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { ensurePermission } from '@/lib/notify';
import { registerPush } from '@/lib/push';
import { useCouple, useSession } from '@/lib/session';
import { invalidate } from '@/lib/store';
import type { User } from '@/lib/types';
import { appUpdates, appVersion, updatesEnabled, updateVersion, useAppUpdates } from '@/lib/updates';
import { colors, radius } from '@/theme';

function Item({ icon: Icon, label, value, onPress, danger }: { icon: LucideIcon; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <PressScale haptics={false} onPress={onPress} style={styles.item}>
      <Icon size={20} color={danger ? colors.accent : colors.inkSoft} />
      <Txt v="body" style={{ flex: 1 }} color={danger ? colors.accent : colors.ink}>
        {label}
      </Txt>
      {value && <Txt v="caption">{value}</Txt>}
      {onPress && !danger && <ChevronRight size={18} color={colors.faint} />}
    </PressScale>
  );
}

function UpdateSettings() {
  const update = useAppUpdates();
  const [busy, setBusy] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  const continueUsing = () => {
    if (appUpdates.getState().phase === 'restarting') return;
    attempt.current++;
    setBusy(false);
  };
  const label = update.pending ? '安装已下载的更新' : '检查更新';
  const check = async () => {
    if (!updatesEnabled()) {
      toast(Platform.OS === 'web' || __DEV__ ? '开发预览中不检查 App 更新' : '此安装包暂未开启在线更新，请安装新版 App', 'ℹ️');
      return;
    }
    setBusy(true);
    const currentAttempt = ++attempt.current;
    try {
      const pending = await appUpdates.check(true);
      if (attempt.current !== currentAttempt) return;
      if (pending) {
        const installed = await appUpdates.install();
        if (!installed) toast(appUpdates.getState().error ?? '更新未能安装，请重试', '⚠️');
      } else {
        const error = appUpdates.getState().error;
        toast(error ?? '已经是最新版本', error ? '⚠️' : '✅');
      }
    } finally { if (attempt.current === currentAttempt) setBusy(false); }
  };
  return (
    <>
      <View style={styles.group}>
        <Item icon={Download} label={busy ? '正在更新…' : label} value={`v${appVersion}`} onPress={busy ? undefined : check} />
        <View style={{ padding: 16, gap: 6 }}>
          <Txt v="caption">启动时自动检查更新，有新版本会自动下载。</Txt>
          <Txt v="caption">{update.pending ? '新版本已下载，下次启动生效，也可以现在安装。' : update.error ?? '更新过程中无法联网时，可以继续使用当前版本。'}</Txt>
          {updateVersion && <Txt v="caption" color={colors.faint}>当前更新：{updateVersion}</Txt>}
        </View>
      </View>
      <Modal visible={busy} transparent animationType="fade" onRequestClose={continueUsing}>
        <View style={{ flex: 1, backgroundColor: 'rgba(75,46,53,0.25)', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 28, alignItems: 'center', gap: 16 }}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Txt v="bodyStrong">{update.phase === 'downloading' ? '正在下载新版本…' : update.phase === 'restarting' ? '正在安装更新…' : '正在检查更新…'}</Txt>
            <Txt v="caption">安装完成后 App 会自动重新打开</Txt>
            {update.phase !== 'restarting' && <Button title="先继续使用" variant="ghost" onPress={continueUsing} />}
          </View>
        </View>
      </Modal>
    </>
  );
}

/** 资料表单：拿到 me 之后才挂载，直接用它做初始值 */
function ProfileForm({ me, showPw, onSaved }: { me: User; showPw: boolean; onSaved: () => void }) {
  const [name, setName] = useState(me.name);
  const [birthday, setBirthday] = useState<string | null>(me.birthday);
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch('/api/me', { name: name.trim() || me.name, birthday, ...(pw ? { password: pw } : {}) });
      haptic.success();
      toast('已保存', '✅');
      setPw('');
      onSaved();
      invalidate('me');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View entering={enter(1)} style={{ gap: 14 }}>
      <Field label="昵称" value={name} onChangeText={setName} maxLength={40} />
      <DatePicker label="我的生日" value={birthday} onChange={setBirthday} showLunar />
      {showPw && (
        <Animated.View entering={FadeInDown.springify()}>
          <Field label="新密码（至少 8 位）" value={pw} onChangeText={setPw} secureTextEntry />
        </Animated.View>
      )}
      <Button title="保存资料" onPress={saveProfile} loading={saving} disabled={!!pw && pw.length < 8} />
    </Animated.View>
  );
}

export default function Settings() {
  const { me, partner } = useCouple();
  const { signOut } = useSession();
  const [showPw, setShowPw] = useState(false);

  const changeAvatar = async () => {
    const [uri] = await pickImages(1);
    if (!uri) return;
    try {
      const [avatar] = await uploadImages([uri]);
      await api.patch('/api/me', { avatar });
      haptic.success();
      invalidate('me');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  return (
    <Screen back title="我的" subtitle="SETTINGS">
      <Animated.View entering={enter(0)} style={styles.couple}>
        <PressScale onPress={changeAvatar} style={{ alignItems: 'center', gap: 6 }}>
          <Avatar user={me} size={76} />
          <Txt v="caption">换头像</Txt>
        </PressScale>
        <Txt style={{ fontSize: 28 }}>💞</Txt>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar user={partner} size={76} />
          <Txt v="caption">{partner?.name ?? '还没有另一半的账号'}</Txt>
        </View>
      </Animated.View>

      {me && <ProfileForm key={me.id} me={me} showPw={showPw} onSaved={() => setShowPw(false)} />}

      <Animated.View entering={enter(2)} style={styles.group}>
        <Item icon={CalendarHeart} label="在一起的日子 & 纪念日" onPress={() => router.push('/anniversaries')} />
        {Platform.OS !== 'web' && <Item
          icon={Bell}
          label="开启提醒通知"
          onPress={async () => {
            if (!(await ensurePermission())) return toast('没有通知权限，请到系统设置里打开', '🔔');
            for (const collection of ['anniversaries', 'todos', 'capsules', 'space']) invalidate(collection);
            const remote = await registerPush().catch(() => false);
            toast(remote ? '提醒已开启，也能收到离线戳一戳' : '本地提醒已开启', '🔔');
          }}
        />}
        <Item icon={KeyRound} label="修改密码" onPress={() => setShowPw((s) => !s)} />
        {Platform.OS !== 'web' && <Item icon={Server} label="服务器" value={getBaseUrl().replace(/^https?:\/\//, '')} />}
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.group}>
        <Item icon={LogOut} label="退出登录" danger onPress={signOut} />
      </Animated.View>
      {Platform.OS === 'web' ? <WebSettings /> : <UpdateSettings />}
      <View style={{ alignItems: 'center', marginTop: 20, gap: 4 }}>
        <Txt v="caption" color={colors.faint}>
          us. · made with love for two
        </Txt>
        <Txt v="caption" color={colors.faint} style={{ fontSize: 11 }}>
          字体：思源柔黑 Resource Han Rounded、Nunito（SIL OFL 1.1）
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  couple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', backgroundColor: colors.surface, borderRadius: radius.xl, paddingVertical: 24, marginBottom: 20 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: 20, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
