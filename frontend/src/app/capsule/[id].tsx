import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Envelope } from '@/components/Envelope';
import { celebrate, toast } from '@/components/motion';
import { PhotoGrid } from '@/components/Photos';
import { Screen } from '@/components/Screen';
import { QueryFallback } from '@/components/Skeleton';
import { Button, PressScale, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { diffDays, fmtFullDate, parseDay, toDay, today } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Capsule } from '@/lib/types';
import { colors, fonts, radius, shadow, springs } from '@/theme';

function Letter({ c }: { c: Capsule }) {
  const { userName } = useCouple();
  const { width } = useWindowDimensions();
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.paper}>
      <Txt v="label">
        写于 {fmtFullDate(toDay(new Date(c.createdAt)))} · {fmtFullDate(c.unlockAt)} 打开
      </Txt>
      <Text style={styles.letterTitle}>{c.title}</Text>
      <Txt v="body" style={{ fontSize: 17, lineHeight: 30 }}>
        {c.content}
      </Txt>
      <Text style={styles.sign}>— {userName(c.createdBy) || 'TA'}</Text>
      {c.photos.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <PhotoGrid photos={c.photos} width={width - 32 - 48} />
        </View>
      )}
    </Animated.View>
  );
}

export default function CapsuleView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = `/api/capsules/${id}`;
  const capsule = useQuery<Capsule>(key);
  const { me, userName } = useCouple();
  const { width } = useWindowDimensions();
  const c = capsule.data;
  const [revealed, setRevealed] = useState(false);

  const progress = useSharedValue(0);
  const seal = useSharedValue(1);
  const shake = useSharedValue(0);
  const hint = useSharedValue(0);
  const envW = Math.min(width - 80, 300);

  const ready = !!c && !c.locked && !!me && !c.openedBy.includes(me.id);
  useEffect(() => {
    if (ready) hint.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
  }, [ready, hint]);

  const envStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { translateY: -6 * hint.value }, { rotate: `${shake.value * 0.4}deg` }],
  }));

  if (!c)
    return (
      <Screen back title="时光胶囊">
        <QueryFallback q={capsule} count={1} />
      </Screen>
    );
  const author = c.createdBy === me?.id;
  const showLetter = !c.locked && (revealed || !ready);

  const finishOpen = () => {
    setRevealed(true);
    celebrate();
    haptic.success();
    api
      .post<Capsule>(`/api/capsules/${c.id}/open`)
      .then((res) => {
        setQueryData(key, () => res);
        invalidate('capsules');
      })
      .catch(() => {});
  };

  const onTapEnvelope = () => {
    if (c.locked) {
      haptic.warn();
      shake.set(withSequence(...[12, -12, 8, -8, 4, 0].map((x) => withTiming(x, { duration: 60 }))));
      toast('还没到时间哦', '🤫', `${fmtFullDate(c.unlockAt)} 才能打开`);
      return;
    }
    // 拆封：火漆印弹开 → 封口翻起 → 信纸抽出 → 展开阅读
    hint.set(withTiming(0, { duration: 150 }));
    haptic.medium();
    seal.set(withTiming(0, { duration: 260 }));
    progress.set(
      withSequence(
        withDelay(220, withTiming(1, { duration: 480 })),
        withSpring(2, { ...springs.soft, stiffness: 120 }, (done) => {
          if (done) scheduleOnRN(finishOpen);
        })
      )
    );
  };

  const remove = async () => {
    if (!(await confirm('删除这个胶囊？', '删除后就再也打不开了'))) return;
    await api.del(`/api/capsules/${c.id}`);
    invalidate('capsules');
    router.back();
  };

  const left = diffDays(parseDay(c.unlockAt), today());

  return (
    <Screen back>
      {showLetter ? (
        <>
          <Letter c={c} />
          {author && <Button title="删除这个胶囊" variant="ghost" onPress={remove} style={{ marginTop: 20 }} />}
        </>
      ) : (
        <View style={{ alignItems: 'center', paddingTop: 24 }}>
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', marginBottom: 56 }}>
            <Txt v="label">{author ? '我' : userName(c.createdBy) || 'TA'} 写于 {fmtFullDate(toDay(new Date(c.createdAt)))}</Txt>
            <Text style={styles.title}>{c.title}</Text>
          </Animated.View>

          <PressScale haptics={false} scaleTo={0.96} onPress={onTapEnvelope}>
            <Animated.View style={[{ paddingTop: envW * 0.5 }, envStyle]}>
              <View style={[shadow, { borderRadius: envW * 0.04 }]}>
                <Envelope width={envW} progress={progress} seal={seal} />
              </View>
            </Animated.View>
          </PressScale>

          {c.locked ? (
            <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: 'center', marginTop: 40, gap: 4 }}>
              <Text style={styles.count}>{left}</Text>
              <Txt v="bodyStrong">天后才能打开</Txt>
              <Txt v="caption" style={{ marginTop: 6 }}>
                {fmtFullDate(c.unlockAt)} · {c.letterLength} 字{c.photoCount ? ` · ${c.photoCount} 张照片` : ''}
              </Txt>
              {author && <Button title="删除这个胶囊" variant="ghost" onPress={remove} style={{ marginTop: 24 }} />}
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: 'center', marginTop: 40, gap: 6 }}>
              <Txt v="heading">到日子啦</Txt>
              <Txt v="caption">轻点信封，拆开它</Txt>
            </Animated.View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.round, fontSize: 28, lineHeight: 36, color: colors.ink, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  count: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, color: colors.ink },
  paper: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, paddingTop: 22, ...shadow },
  letterTitle: { fontFamily: fonts.round, fontSize: 26, lineHeight: 34, color: colors.ink, marginTop: 14, marginBottom: 16 },
  sign: { fontFamily: fonts.roundMedium, fontSize: 18, color: colors.inkSoft, textAlign: 'right', marginTop: 24 },
});
