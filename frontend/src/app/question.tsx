import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { celebrate, toast } from '@/components/motion';
import { SheetScreen } from '@/components/Screen';
import { Avatar, Button, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, parseDay, toDay, today } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { QUESTIONS, questionOfDay } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Answer } from '@/lib/types';
import { colors, fonts, radius, shadow } from '@/theme';

/** 对方的答案：自己答完之前是毛玻璃，答完后翻牌揭晓 */
function PartnerAnswer({ answer, revealed }: { answer?: Answer; revealed: boolean }) {
  const { partner } = useCouple();
  const flip = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    flip.value = withSpring(revealed ? 1 : 0, { damping: 14, stiffness: 90 });
  }, [revealed, flip]);
  const anim = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${(1 - flip.value) * 180}deg` }] }));

  return (
    <Animated.View style={[styles.card, anim]}>
      <Row style={{ marginBottom: 10 }}>
        <Avatar user={partner} size={26} />
        <Txt v="label">{partner?.name ?? 'TA'} 的回答</Txt>
      </Row>
      {!answer ? (
        <Txt v="body" color={colors.muted}>
          还没回答，戳 TA 一下？
        </Txt>
      ) : (
        <View>
          <Txt v="body" style={{ fontSize: 17, lineHeight: 26 }}>
            {revealed ? answer.content : '············'}
          </Txt>
          {!revealed && (
            <BlurView intensity={Platform.OS === 'web' ? 20 : 40} tint="light" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', borderRadius: 8 }]}>
              <Txt v="caption" style={{ fontWeight: '600' }}>
                回答后可见
              </Txt>
            </BlurView>
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function Question() {
  const { me, userName } = useCouple();
  const day = toDay(today());
  const q = questionOfDay();
  const key = `/api/answers?day=${day}`;
  const answers = useQuery<Answer[]>(key);
  const history = useQuery<Answer[]>('/api/answers/history');
  const mine = answers.data?.find((a) => a.createdBy === me?.id);
  const theirs = answers.data?.find((a) => a.createdBy !== me?.id);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await api.put<Answer[]>(`/api/answers/${day}`, { question: q.index, content: text.trim() });
      setQueryData(key, () => res);
      setEditing(false);
      haptic.success();
      if (theirs && !mine) setTimeout(celebrate, 500);
      invalidate('answers');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  // 往期：按天分组，两个人都答了的才展示
  const past = Object.entries(
    (history.data ?? []).filter((a) => a.day !== day).reduce<Record<string, Answer[]>>((acc, a) => ((acc[a.day] ??= []).push(a), acc), {})
  ).filter(([, list]) => list.length >= 2);

  return (
    <SheetScreen title="每日一问">
      <Animated.View entering={FadeInDown.springify().damping(18)}>
        <Txt v="label">{fmtDate(day, true)}</Txt>
        <Text style={{ fontFamily: fonts.round, fontSize: 28, lineHeight: 38, color: colors.ink, marginTop: 8 }}>{q.text}</Text>
      </Animated.View>

      {mine && !editing ? (
        <Animated.View entering={FadeIn} style={[styles.card, { backgroundColor: colors.peach }]}>
          <Row style={{ marginBottom: 10, justifyContent: 'space-between' }}>
            <Row>
              <Avatar user={me} size={26} />
              <Txt v="label" color={colors.peachInk}>
                我的回答
              </Txt>
            </Row>
            <Txt
              v="caption"
              color={colors.peachInk}
              onPress={() => {
                setText(mine.content ?? '');
                setEditing(true);
              }}>
              修改
            </Txt>
          </Row>
          <Txt v="body" style={{ fontSize: 17, lineHeight: 26 }}>
            {mine.content}
          </Txt>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(100).springify()} style={{ gap: 12 }}>
          <TextInput value={text} onChangeText={setText} placeholder="写下你的答案…" placeholderTextColor={colors.faint} multiline style={styles.input} maxLength={1000} />
          <Button title={theirs ? '提交并揭晓 TA 的答案' : '提交'} variant="accent" onPress={submit} loading={saving} disabled={!text.trim()} />
        </Animated.View>
      )}

      <PartnerAnswer answer={theirs} revealed={!!mine} />

      {past.length > 0 && (
        <View style={{ gap: 12, marginTop: 12 }}>
          <Txt v="label">往期</Txt>
          {past.slice(0, 20).map(([d, list]) => (
            <View key={d} style={[styles.card, { gap: 8 }]}>
              <Txt v="caption">{fmtDate(parseDay(d))}</Txt>
              <Txt v="bodyStrong">{QUESTIONS[list[0].question] ?? ''}</Txt>
              {list.map((a) => (
                <Txt key={a.id} v="body" color={colors.inkSoft}>
                  <Txt v="bodyStrong">{userName(a.createdBy)}：</Txt>
                  {a.content}
                </Txt>
              ))}
            </View>
          ))}
        </View>
      )}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, backfaceVisibility: 'hidden', ...shadow },
  input: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, minHeight: 140, fontSize: 17, lineHeight: 25, color: colors.ink, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.line },
});
