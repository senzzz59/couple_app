import * as Clipboard from 'expo-clipboard';
import { Copy, RefreshCw, Send } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { toast } from '@/components/motion';
import { Button, Field, PressScale, Row, Txt } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { cleanInviteCode, coupleApi, formatInviteCode, INVITE_LENGTH, refreshPairing, shareInvite } from '@/lib/couple';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';

/** 我的邀请码：大字显示，发给 TA / 复制 / 换一个 */
export function InviteCode({ code, onRenewed }: { code: string; onRenewed?: (code: string) => void }) {
  const [renewing, setRenewing] = useState(false);
  const send = async () => {
    const how = await shareInvite(code);
    if (how === 'copied') toast('邀请已复制，粘贴发给 TA 吧', '📋');
  };
  const copy = async () => {
    await Clipboard.setStringAsync(formatInviteCode(code));
    haptic.success();
    toast('邀请码已复制', '📋');
  };
  const renew = async () => {
    if (!(await confirm('换一个邀请码？', '旧的邀请码会立刻失效', '换一个', { tone: 'normal' }))) return;
    setRenewing(true);
    try {
      const { couple } = await coupleApi.newCode();
      haptic.success();
      if (couple.inviteCode) onRenewed?.(couple.inviteCode);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setRenewing(false);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <PressScale scaleTo={0.97} onPress={copy} style={styles.codeBox} accessibilityLabel={`邀请码 ${code}，点按复制`}>
        <Animated.View key={code} entering={ZoomIn.springify().damping(14)}>
          <Text style={styles.code} selectable>
            {formatInviteCode(code)}
          </Text>
        </Animated.View>
        <Row gap={6}>
          <Copy size={13} color={colors.pinkInk} />
          <Txt v="caption" color={colors.pinkInk}>
            点一下复制
          </Txt>
        </Row>
      </PressScale>
      <Button title="发给 TA" icon={Send} onPress={send} />
      <PressScale haptics={false} onPress={renew} disabled={renewing} style={{ alignSelf: 'center', padding: 6 }}>
        <Row gap={6}>
          <RefreshCw size={13} color={colors.muted} />
          <Txt v="caption">{renewing ? '正在换…' : '换一个邀请码'}</Txt>
        </Row>
      </PressScale>
    </View>
  );
}

/** 填 TA 的邀请码。自己已经建了空间时，加入前要确认放弃它 */
export function JoinForm({ onJoined }: { onJoined?: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = code.length === INVITE_LENGTH;

  const join = async (leaveCurrent = false): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await coupleApi.join(code, leaveCurrent);
      haptic.success();
      toast('连上啦', '💗');
      refreshPairing();
      onJoined?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LEAVE_CURRENT') {
        setBusy(false);
        if (await confirm('加入 TA 的空间？', '你自己空间里已经记下的内容会被删除，不能恢复', '加入')) return join(true);
        return;
      }
      haptic.warn();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Field
        label="TA 的邀请码"
        value={code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code}
        onChangeText={(t) => {
          setCode(cleanInviteCode(t));
          setError('');
        }}
        placeholder="ABCD-EFGH"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={INVITE_LENGTH + 1}
        returnKeyType="go"
        onSubmitEditing={() => join()}
      />
      {!!error && (
        <Txt v="caption" color={colors.danger} style={{ marginLeft: 4 }}>
          {error}
        </Txt>
      )}
      <Button title="加入 TA 的空间" variant="secondary" onPress={() => join()} loading={busy} disabled={!ready} />
    </View>
  );
}

const styles = StyleSheet.create({
  codeBox: { backgroundColor: colors.pink, borderRadius: radius.lg, paddingVertical: 22, alignItems: 'center', gap: 6 },
  code: { fontFamily: fonts.displayBold, fontSize: 38, letterSpacing: 4, color: colors.ink },
});
