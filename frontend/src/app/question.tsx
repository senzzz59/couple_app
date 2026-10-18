import { BlurView } from 'expo-blur';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AskSheet } from '@/components/AskSheet';
import { celebrate, toast } from '@/components/motion';
import { goBack, Screen } from '@/components/Screen';
import { Avatar, Button, Empty, IconButton, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { fmtDate, parseDay, timeAgo } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { QUESTIONS, questionState } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Answer, Question as Q, User } from '@/lib/types';
import { useKept } from '@/lib/useKept';
import { colors, fonts, radius, shadow } from '@/theme';

/** 对方的答案：自己答完之前是毛玻璃，答完后翻牌揭晓 */
function PartnerAnswer({ user, content, answered, revealed, hint }: { user?: User | null; content?: string | null; answered: boolean; revealed: boolean; hint: string }) {
  // 平时正面朝上（没揭晓时盖着毛玻璃）；刚揭晓的那一下从背面翻过来
  const flip = useSharedValue(1);
  const was = useRef(revealed);
  useEffect(() => {
    if (revealed && !was.current) {
      flip.value = 0;
      flip.value = withSpring(1, { damping: 14, stiffness: 90 });
    }
    was.current = revealed;
  }, [revealed, flip]);
  const anim = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${(1 - flip.value) * 180}deg` }] }));
  return (
    <Animated.View style={[styles.card, anim]}>
      <Row style={{ marginBottom: 10 }}>
        <Avatar user={user} size={26} />
        <Txt v="label">{user?.name ?? 'TA'} 的回答</Txt>
      </Row>
      {!answered ? (
        <Txt v="body" color={colors.muted}>
          {hint}
        </Txt>
      ) : (
        <View>
          <Txt v="body" style={{ fontSize: 17, lineHeight: 26 }}>
            {revealed ? content : '············'}
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

type View_ = {
  key: string;
  byline: string;
  text: string;
  mine?: string | null;
  theirs?: { content: string | null } | undefined;
  iMust: boolean;
  theyMust: boolean;
  submit: (content: string) => Promise<void>;
  remove?: () => void;
};

/** 一个问题：问题、我的回答、TA 的回答 */
function QuestionBody({ v }: { v: View_ }) {
  const { me, partner } = useCouple();
  const [text, setText] = useKept(`question:${v.key}:text`, '');
  const [editing, setEditing] = useKept(`question:${v.key}:editing`, false);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const name = partner?.name || 'TA';

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const first = v.mine == null;
      await v.submit(text.trim());
      setEditing(false);
      haptic.success();
      if (first && v.theirs) setTimeout(celebrate, 500);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back title=" " right={v.remove && <IconButton icon={Trash2} onPress={v.remove} bg={colors.surfaceAlt} size={40} label="删除这个问题" />}>
      <View style={{ gap: 18 }}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: 8 }}>
          <Txt v="label">{v.byline}</Txt>
          <Text style={{ fontFamily: fonts.round, fontSize: 28, lineHeight: 38, color: colors.ink }}>{v.text}</Text>
        </Animated.View>

        {!v.iMust ? (
          <Txt v="secondary">这个问题只需要 {name} 回答</Txt>
        ) : v.mine != null && !editing ? (
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
                  setText(v.mine ?? '');
                  setEditing(true);
                }}>
                修改
              </Txt>
            </Row>
            <Txt v="body" style={{ fontSize: 17, lineHeight: 26 }}>
              {v.mine}
            </Txt>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={{ gap: 12 }}>
            <TextInput value={text} onChangeText={setText} placeholder="写下你的答案…" placeholderTextColor={colors.faint} multiline style={styles.input} maxLength={1000} />
            <Button title={v.theirs ? `提交并揭晓${name}的答案` : '提交'} variant="accent" onPress={submit} loading={saving} disabled={!text.trim()} />
          </Animated.View>
        )}

        {v.theyMust && <PartnerAnswer user={partner} content={v.theirs?.content} answered={!!v.theirs} revealed={v.theirs?.content != null} hint={`${name}还没回答`} />}

        <Button title={`再问${name}一个`} variant="secondary" onPress={() => setAsking(true)} />
      </View>
      <AskSheet visible={asking} onClose={() => setAsking(false)} />
    </Screen>
  );
}

function Loading() {
  return (
    <Screen back title=" ">
      <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
    </Screen>
  );
}

/** 自己提的问题 */
function OwnQuestion({ id }: { id: string }) {
  const { me, userName } = useCouple();
  const key = `/api/questions/${id}`;
  const q = useQuery<Q>(key);
  if (q.error && !q.data)
    return (
      <Screen back title=" ">
        <Empty title={q.error} hint="可能已经被删除了" action={<Button title="去问答列表" onPress={() => router.replace('/questions')} />} />
      </Screen>
    );
  if (!q.data) return <Loading />;
  const s = questionState(q.data, me?.id);
  return (
    <QuestionBody
      v={{
        key: id,
        byline: `${s.asker ? '我' : userName(q.data.createdBy)}问的 · ${timeAgo(q.data.createdAt)}`,
        text: q.data.text,
        mine: s.mine?.content,
        theirs: s.theirs,
        iMust: s.iMust,
        theyMust: s.theyMust,
        submit: async (content) => {
          const res = await api.put<Q>(`/api/questions/${id}/answer`, { content });
          setQueryData(key, () => res);
          invalidate('questions');
        },
        remove: s.asker
          ? async () => {
              if (!(await confirm('删除这个问题？', '两个人的回答也会一起删除'))) return;
              try {
                await api.del(`/api/questions/${id}`);
                invalidate('questions');
                goBack();
              } catch (e) {
                toast((e as Error).message, '⚠️');
              }
            }
          : undefined,
      }}
    />
  );
}

/** 以前自动出的每日一问：还能补答 */
function DailyQuestion({ day }: { day: string }) {
  const { me } = useCouple();
  const key = `/api/answers?day=${day}`;
  const answers = useQuery<Answer[]>(key);
  if (!answers.data) return <Loading />;
  const list = answers.data;
  const mine = list.find((a) => a.createdBy === me?.id);
  const theirs = list.find((a) => a.createdBy !== me?.id);
  const index = (mine ?? theirs)?.question;
  if (index == null) return <Redirect href="/questions" />;
  return (
    <QuestionBody
      v={{
        key: `day-${day}`,
        byline: `每日一问 · ${fmtDate(parseDay(day))}`,
        text: QUESTIONS[index] ?? '',
        mine: mine?.content,
        theirs,
        iMust: true,
        theyMust: true,
        submit: async (content) => {
          const res = await api.put<Answer[]>(`/api/answers/${day}`, { question: index, content });
          setQueryData(key, () => res);
          invalidate('answers');
        },
      }}
    />
  );
}

/** /question?id=…：自己提的问题；?day=…：以前的每日一问；什么都没有（旧链接）：去问答列表 */
export default function Question() {
  const { id, day } = useLocalSearchParams<{ id?: string; day?: string }>();
  useEffect(() => {
    if (!id && !day) router.replace('/questions');
  }, [id, day]);
  if (id) return <OwnQuestion id={id} />;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return <DailyQuestion day={day} />;
  return <Loading />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, backfaceVisibility: 'hidden', ...shadow },
  input: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, minHeight: 140, fontSize: 17, lineHeight: 25, color: colors.ink, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.line },
});
