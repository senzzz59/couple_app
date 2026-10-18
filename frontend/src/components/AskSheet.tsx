import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { suggestQuestions } from '@/lib/questions';
import { useCouple } from '@/lib/session';
import { invalidate } from '@/lib/store';
import type { Question } from '@/lib/types';
import { useKept } from '@/lib/useKept';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Sheet } from './Sheet';
import { Button, PressScale, Row, Txt } from './ui';

/** 问 TA 一个问题：自己写，或点一条灵感改改；默认自己也一起答（都答完才互相看到） */
export function AskSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { partner } = useCouple();
  const name = partner?.name || 'TA';
  const [text, setText] = useKept('ask:text', '');
  const [both, setBoth] = useKept('ask:both', true);
  const [ideas, setIdeas] = useState(() => suggestQuestions());
  const [sending, setSending] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const q = await api.post<Question>('/api/questions', { text: t, askerAnswers: both });
      haptic.success();
      setText('');
      invalidate('questions');
      onClose();
      if (both) router.push({ pathname: '/question', params: { id: q.id } });
      else toast(`已经问${name}了，TA 答完会告诉你`, '💌');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere={false} style={{ gap: 14 }}>
      <Txt v="heading" style={{ fontSize: 22 }}>
        问{name}一个问题
      </Txt>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="想问 TA 点什么？"
        placeholderTextColor={colors.faint}
        multiline
        maxLength={200}
        style={styles.input}
      />
      <View style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="caption">没灵感？点一个改改</Txt>
          <Txt v="caption" color={colors.accentStrong} style={{ fontWeight: '700' }} onPress={() => setIdeas(suggestQuestions(3, ideas))}>
            换一批
          </Txt>
        </Row>
        <View style={styles.ideas}>
          {ideas.map((q) => (
            <PressScale key={q} onPress={() => setText(q)} style={styles.idea}>
              <Txt v="secondary" color={colors.inkSoft}>
                {q}
              </Txt>
            </PressScale>
          ))}
        </View>
      </View>
      <Row style={styles.toggle}>
        <View style={{ flex: 1 }}>
          <Txt v="bodyStrong">我也一起答</Txt>
          <Txt v="caption">{both ? '两个人都答完才互相看到' : `只有${name}答，TA 答完你就能看到`}</Txt>
        </View>
        <Switch value={both} onValueChange={setBoth} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.white} {...({ activeThumbColor: colors.white } as object)} />
      </Row>
      <Button title={`发给${name}`} variant="accent" onPress={send} loading={sending} disabled={!text.trim()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // 16 号以上：iOS 上小于 16 的输入框一点就会把页面放大
  input: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, minHeight: 96, fontSize: 17, lineHeight: 25, color: colors.ink, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.line },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  toggle: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
});
