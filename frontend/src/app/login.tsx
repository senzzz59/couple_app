import { ChevronLeft, Server } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodeInput } from '@/components/CodeInput';
import { BlobCouple } from '@/components/Mascot';
import { Segmented } from '@/components/motion';
import { Button, Field, PressScale, Row, Txt } from '@/components/ui';
import { api, getBaseUrl, normalizeUrl } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/theme';

type Mode = 'login' | 'register' | 'reset';

/** 背景里慢慢漂浮的马卡龙小圆点 */
const DOTS = [
  { x: '8%', y: '10%', s: 18, c: colors.pink, d: 0 },
  { x: '82%', y: '7%', s: 26, c: colors.peach, d: 400 },
  { x: '88%', y: '30%', s: 12, c: '#F9C9D5', d: 900 },
  { x: '5%', y: '38%', s: 14, c: colors.peach, d: 1300 },
  { x: '75%', y: '52%', s: 10, c: colors.pink, d: 600 },
] as const;
function FloatingDot({ x, y, s, c, d }: (typeof DOTS)[number]) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(d, withRepeat(withTiming(1, { duration: 2600 }), -1, true)));
  }, [t, d]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * t.value }, { scale: 1 + 0.12 * t.value }] }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: s / 2, backgroundColor: c }, style]} />;
}

/** 邮箱输入框右侧的“发送验证码 / 59s” */
function SendCodeButton({ onSend, disabled }: { onSend: () => Promise<number | void>; disabled: boolean }) {
  const [left, setLeft] = useState(0);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <PressScale
      disabled={disabled || left > 0 || sending}
      onPress={async () => {
        setSending(true);
        try {
          const wait = await onSend();
          if (wait) setLeft(wait);
        } finally {
          setSending(false);
        }
      }}
      style={[styles.sendBtn, (disabled || left > 0) && { opacity: 0.45 }]}>
      <Txt v="caption" color={colors.white} style={{ fontWeight: '700' }}>
        {sending ? '发送中…' : left > 0 ? `${left}s` : '发送验证码'}
      </Txt>
    </PressScale>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn, signInWithToken } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [url, setUrl] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(Platform.OS !== 'web' && !getBaseUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const pwRef = useRef<TextInput>(null);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const fail = (msg: string) => {
    setError(msg);
    haptic.warn();
    shake.set(withSequence(...[10, -10, 7, -7, 3, 0].map((x) => withTiming(x, { duration: 55 }))));
  };

  const server = normalizeUrl(url);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    setCode('');
    setCodeSent(false);
    setPassword('');
  };

  const sendCode = async () => {
    setError('');
    if (!server) return fail('先填一下服务器地址');
    try {
      const res = await api.sendCode(server, email.trim(), mode === 'reset' ? 'reset' : 'register');
      setCodeSent(true);
      setInfo(`验证码已发到 ${email.trim()}，10 分钟内有效`);
      haptic.success();
      return res.resendAfter;
    } catch (e) {
      fail((e as Error).message);
    }
  };

  const submit = async () => {
    setError('');
    if (!server) {
      setShowServer(true);
      return fail('先填一下服务器地址');
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(server, email, password);
      } else if (mode === 'register') {
        const res = await api.register(server, { email: email.trim(), code, password, name: name.trim() });
        await signInWithToken(server, res.token);
      } else {
        const res = await api.resetPassword(server, { email: email.trim(), code, password });
        await signInWithToken(server, res.token);
      }
      haptic.success();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    mode === 'login' ? !!email && !!password : mode === 'register' ? !!email && code.length === 6 && password.length >= 8 && !!name.trim() : !!email && code.length === 6 && password.length >= 8;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {DOTS.map((d, i) => (
        <FloatingDot key={i} {...d} />
      ))}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}>
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', marginBottom: 28 }}>
            <BlobCouple size={170} />
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 46, color: colors.ink, marginTop: 6 }}>
              us<Text style={{ color: colors.accent }}>.</Text>
            </Text>
            <Txt v="caption" style={{ marginTop: 2 }}>
              只属于我们两个人的小角落
            </Txt>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify().damping(18)}>
            <Animated.View layout={LinearTransition.springify().damping(20)} style={[{ gap: 14 }, shakeStyle]}>
              {mode === 'reset' ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  <PressScale haptics={false} onPress={() => switchMode('login')} style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
                    <ChevronLeft size={18} color={colors.inkSoft} />
                    <Txt v="bodyStrong" color={colors.inkSoft}>
                      返回登录
                    </Txt>
                  </PressScale>
                  <Txt v="heading">重置密码</Txt>
                </Row>
              ) : (
                <Segmented
                  options={[
                    { key: 'login', label: '登录' },
                    { key: 'register', label: '注册' },
                  ]}
                  value={mode}
                  onChange={switchMode}
                />
              )}

              {Platform.OS !== 'web' && showServer && (
                <Animated.View entering={FadeInDown.springify()}>
                  <Field label="服务器地址" value={url} onChangeText={setUrl} placeholder="例如 https://us.example.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                </Animated.View>
              )}

              <View>
                <Field
                  label="邮箱"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => mode === 'login' && pwRef.current?.focus()}
                />
                {mode !== 'login' && (
                  <View style={styles.sendWrap}>
                    <SendCodeButton onSend={sendCode} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
                  </View>
                )}
              </View>

              {mode !== 'login' && codeSent && (
                <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut} style={{ gap: 8 }}>
                  <Txt v="label" style={{ marginLeft: 4 }}>
                    验证码
                  </Txt>
                  <CodeInput value={code} onChange={setCode} />
                </Animated.View>
              )}

              {mode === 'register' && codeSent && (
                <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
                  <Field label="昵称" value={name} onChangeText={setName} placeholder="TA 怎么称呼你" maxLength={40} />
                </Animated.View>
              )}

              {(mode === 'login' || codeSent) && (
                <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
                  <Field
                    ref={pwRef}
                    label={mode === 'login' ? '密码' : mode === 'register' ? '设置密码（至少 8 位）' : '新密码（至少 8 位）'}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    textContentType={mode === 'login' ? 'password' : 'newPassword'}
                    returnKeyType="go"
                    onSubmitEditing={() => canSubmit && submit()}
                  />
                </Animated.View>
              )}

              {!!(error || info) && (
                <Animated.View key={error || info} entering={FadeIn}>
                  <Txt v="caption" color={error ? colors.accent : colors.sageInk} style={{ textAlign: 'center' }}>
                    {error || info}
                  </Txt>
                </Animated.View>
              )}

              {(mode === 'login' || codeSent) && (
                <Button
                  title={mode === 'login' ? '进入我们的空间' : mode === 'register' ? '创建账号' : '重置并登录'}
                  onPress={submit}
                  loading={loading}
                  disabled={!canSubmit}
                  style={{ marginTop: 4 }}
                />
              )}
            </Animated.View>
          </Animated.View>

          <Row style={{ justifyContent: 'center', marginTop: 24, gap: 20 }}>
            {mode === 'login' && (
              <PressScale haptics={false} onPress={() => switchMode('reset')} style={{ padding: 8 }}>
                <Txt v="caption">忘记密码？</Txt>
              </PressScale>
            )}
            {Platform.OS !== 'web' && !showServer && (
              <PressScale haptics={false} onPress={() => setShowServer(true)} style={{ padding: 8 }}>
                <Row gap={6}>
                  <Server size={13} color={colors.muted} />
                  <Txt v="caption">更改服务器</Txt>
                </Row>
              </PressScale>
            )}
          </Row>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  sendWrap: { position: 'absolute', right: 6, bottom: 6 },
  sendBtn: { height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
