import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteCode, JoinForm } from '@/components/Invite';
import { BlobCouple } from '@/components/Mascot';
import { toast } from '@/components/motion';
import { CENTERED } from '@/components/Screen';
import { Button, PressScale, Txt } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { coupleApi, refreshPairing } from '@/lib/couple';
import { haptic } from '@/lib/haptics';
import { useCouple, useSession } from '@/lib/session';
import { colors, radius } from '@/theme';

/**
 * 登录后还没有空间：先来的人建空间、把邀请码发给 TA；后来的人填邀请码加入。
 * 建好后先留在这一页把邀请码发出去，点「先进去看看」才进入 App。
 */
export default function Pair() {
  const insets = useSafeAreaInsets();
  const { me } = useCouple();
  const { signOut } = useSession();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const { couple } = await coupleApi.create();
      haptic.success();
      setCode(couple.inviteCode);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setCreating(false);
    }
  };

  const logout = async () => {
    if (await confirm('退出登录？', '', '退出')) signOut();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, gap: 20 }, CENTERED, { maxWidth: 480 }]}>
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', gap: 4 }}>
            <BlobCouple size={150} me={me} partner={null} />
            <Txt v="title" style={{ marginTop: 6 }}>
              {code ? '空间建好啦' : `你好，${me?.name ?? ''}`}
            </Txt>
            <Txt v="secondary" style={{ textAlign: 'center' }}>
              {code ? '把邀请码发给 TA，TA 注册后填进来，你们就连在一起了' : '和 TA 连在一起，开始记录你们的日子'}
            </Txt>
          </Animated.View>

          {code ? (
            <Animated.View entering={FadeInDown.springify().damping(16)} style={{ gap: 16 }}>
              <InviteCode code={code} onRenewed={setCode} />
              <Button title="先进去看看" variant="secondary" onPress={refreshPairing} />
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={FadeInDown.delay(150).springify().damping(16)} style={styles.card}>
                <Txt v="heading">我先来</Txt>
                <Txt v="secondary">建一个我们的空间，拿到邀请码发给 TA</Txt>
                <Button title="创建我们的空间" onPress={create} loading={creating} />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(250).springify().damping(16)} style={styles.card}>
                <Txt v="heading">TA 已经建好了</Txt>
                <JoinForm />
              </Animated.View>
            </>
          )}

          <PressScale haptics={false} onPress={logout} style={{ alignSelf: 'center', padding: 8 }}>
            <Txt v="caption">{me?.email ? `${me.email} · ` : ''}退出登录</Txt>
          </PressScale>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
