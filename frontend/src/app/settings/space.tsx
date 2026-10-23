import { HeartCrack, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { InviteCode, JoinForm } from '@/components/Invite';
import { BlobCouple } from '@/components/Mascot';
import { toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Group, SettingRow } from '@/components/SettingsList';
import { Sheet } from '@/components/Sheet';
import { Button, enter, Field, Txt } from '@/components/ui';
import { type CoupleInfo, coupleApi, refreshPairing } from '@/lib/couple';
import { haptic } from '@/lib/haptics';
import { useCouple, useSession } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import { colors, radius } from '@/theme';

type Danger = 'leave' | 'delete' | null;

/** 我们的空间：邀请 TA、解除关系、注销账号 */
export default function SpaceSettings() {
  const { me, partner } = useCouple();
  const { signOut } = useSession();
  const couple = useQuery<{ couple: CoupleInfo | null }>('/api/couple');
  const [danger, setDanger] = useState<Danger>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const name = partner?.name || 'TA';
  const code = couple.data?.couple?.inviteCode;

  const close = () => {
    setDanger(null);
    setPassword('');
  };

  const run = async () => {
    if (!danger || !password) return;
    setBusy(true);
    try {
      if (danger === 'leave') {
        await coupleApi.leave(password);
        close();
        haptic.success();
        toast('已解除关系');
        refreshPairing();
      } else {
        await coupleApi.deleteAccount(password);
        close();
        toast('账号已注销');
        await signOut();
      }
    } catch (e) {
      haptic.warn();
      toast((e as Error).message, '⚠️');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="我们的空间">
      <View style={{ gap: 24 }}>
        <Animated.View entering={enter(0)} style={styles.card}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <BlobCouple size={130} me={me} partner={partner} />
            <Txt v="heading">{partner ? `你和 ${name} 已经连在一起` : '还在等 TA 加入'}</Txt>
            {!partner && <Txt v="secondary" style={{ textAlign: 'center' }}>把邀请码发给 TA，TA 注册后填进来就好</Txt>}
          </View>
          {!partner && code && <InviteCode code={code} onRenewed={() => invalidate('couple')} />}
        </Animated.View>

        {!partner && (
          <Animated.View entering={enter(1)} style={styles.card}>
            <Txt v="heading">TA 已经建好空间了？</Txt>
            <Txt v="secondary">填 TA 的邀请码，加入 TA 的空间</Txt>
            <JoinForm />
          </Animated.View>
        )}

        <Animated.View entering={enter(2)}>
          <Group>
            {partner && <SettingRow first icon={HeartCrack} label="解除关系" danger onPress={() => setDanger('leave')} />}
            <SettingRow first={!partner} icon={UserX} label="注销账号" danger onPress={() => setDanger('delete')} />
          </Group>
        </Animated.View>
      </View>

      <Sheet visible={!!danger} onClose={close}>
        <Txt v="heading">{danger === 'leave' ? `和 ${name} 解除关系？` : '注销账号？'}</Txt>
        <Txt v="secondary">
          {danger === 'leave'
            ? `解除后你就看不到这个空间了，里面的照片、动态、聊天会留给 ${name}。`
            : partner
              ? `账号会被永久删除，不能恢复。这个空间里的内容会留给 ${name}。`
              : '账号会被永久删除，你空间里的照片、动态等内容也会一起删除，不能恢复。'}
        </Txt>
        <Field label="输入密码确认" value={password} onChangeText={setPassword} secureTextEntry autoFocus onSubmitEditing={run} />
        <Button title={danger === 'leave' ? '解除关系' : '永久注销'} onPress={run} loading={busy} disabled={!password} style={{ backgroundColor: colors.danger }} />
        <Button title="再想想" variant="ghost" onPress={close} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
