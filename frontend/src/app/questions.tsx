import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AskSheet } from '@/components/AskSheet';
import { Segmented } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Avatar, Empty, enter, PressScale, Row, Txt } from '@/components/ui';
import { fmtDate, parseDay, timeAgo } from '@/lib/dates';
import { QUESTIONS, questionState, type QuestionStatus } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Answer, Question } from '@/lib/types';
import { colors, radius, shadow } from '@/theme';

/** 列表里的一行：自己提的问题，或者以前自动出的每日一问 */
type Entry = { key: string; at: string; when: string; text: string; asker: 'me' | 'partner' | 'daily'; status: QuestionStatus; open: () => void };

const TAG: Record<QuestionStatus, { label: string; bg: string; fg: string }> = {
  yours: { label: '轮到你', bg: colors.accentSoft, fg: colors.pinkInk },
  waiting: { label: '等 TA 回答', bg: colors.surfaceAlt, fg: colors.inkSoft },
  done: { label: '都答了', bg: colors.peach, fg: colors.peachInk },
};

/** 以前的每日一问：按天合成一条 */
function legacyEntries(history: Answer[], me?: string | null): Entry[] {
  const byDay = new Map<string, Answer[]>();
  for (const a of history) byDay.set(a.day, [...(byDay.get(a.day) ?? []), a]);
  return [...byDay].map(([day, list]) => {
    const mine = list.some((a) => a.createdBy === me);
    const theirs = list.some((a) => a.createdBy !== me);
    return {
      key: `day-${day}`,
      at: `${day}T12:00:00`,
      when: fmtDate(parseDay(day)),
      text: QUESTIONS[list[0].question] ?? '',
      asker: 'daily',
      status: !mine ? 'yours' : !theirs ? 'waiting' : 'done',
      open: () => router.push({ pathname: '/question', params: { day } }),
    };
  });
}

/** 我们的问答：待回答 / 全部，往期都在这里 */
export default function Questions() {
  const { me, partner } = useCouple();
  const questions = useQuery<Question[]>('/api/questions');
  const history = useQuery<Answer[]>('/api/answers/history');
  const [tab, setTab] = useState<'todo' | 'all'>('todo');
  const [asking, setAsking] = useState(false);

  const entries = useMemo(() => {
    const own: Entry[] = (questions.data ?? []).map((q) => ({
      key: q.id,
      at: q.createdAt,
      when: timeAgo(q.createdAt),
      text: q.text,
      asker: q.createdBy === me?.id ? 'me' : 'partner',
      status: questionState(q, me?.id).status,
      open: () => router.push({ pathname: '/question', params: { id: q.id } }),
    }));
    return [...own, ...legacyEntries(history.data ?? [], me?.id)].sort((a, b) => b.at.localeCompare(a.at));
  }, [questions.data, history.data, me?.id]);
  // 待回答只算你们自己提的问题；以前的每日一问没答的就留在「全部」里
  const todo = entries.filter((e) => e.status === 'yours' && e.asker !== 'daily');
  const shown = tab === 'todo' ? todo : entries;
  const who = { me: '我问的', partner: `${partner?.name || 'TA'}问的`, daily: '每日一问' };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        back
        title="我们的问答"
        onRefresh={async () => {
          await Promise.all([invalidate('questions'), invalidate('answers')]);
        }}>
        <PressScale onPress={() => setAsking(true)} style={styles.ask} accessibilityLabel="问 TA 一个问题">
          <Txt v="body" color={colors.muted} style={{ flex: 1 }}>
            问{partner?.name || 'TA'}点什么…
          </Txt>
          <View style={styles.askBtn}>
            <Plus size={18} color={colors.white} strokeWidth={2.6} />
          </View>
        </PressScale>
        <View style={{ marginTop: 14 }}>
          <Segmented
            options={[
              { key: 'todo', label: `待回答${todo.length ? ` · ${todo.length}` : ''}` },
              { key: 'all', label: `全部${entries.length ? ` · ${entries.length}` : ''}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        <View style={{ gap: 10, marginTop: 14 }}>
          {questions.data && shown.length === 0 && (tab === 'todo' ? <Empty title="都答完啦" hint="去「全部」翻翻以前的问题，或者问 TA 一个新的" /> : <Empty title="还没有问题" hint="问 TA 第一个问题吧" />)}
          {shown.map((e, i) => {
            const tag = TAG[e.status];
            return (
              <Animated.View key={e.key} entering={enter(i)}>
                <PressScale onPress={e.open} style={styles.card}>
                  <Row gap={8}>
                    {e.asker === 'daily' ? <View style={styles.dailyDot} /> : <Avatar user={e.asker === 'me' ? me : partner} size={20} />}
                    <Txt v="caption" style={{ flex: 1 }} numberOfLines={1}>
                      {who[e.asker]} · {e.when}
                    </Txt>
                    <View style={[styles.tag, { backgroundColor: tag.bg }]}>
                      <Txt v="caption" color={tag.fg} style={{ fontSize: 12 }}>
                        {e.asker === 'daily' && e.status === 'yours' ? '没答' : tag.label}
                      </Txt>
                    </View>
                  </Row>
                  <Txt v="bodyStrong" style={{ lineHeight: 23 }}>
                    {e.text}
                  </Txt>
                </PressScale>
              </Animated.View>
            );
          })}
        </View>
      </Screen>
      <AskSheet visible={asking} onClose={() => setAsking(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 26, backgroundColor: colors.surface, paddingLeft: 18, paddingRight: 7, ...shadow },
  askBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentStrong, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 8, ...shadow, shadowOpacity: 0.04 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  dailyDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.line },
});
