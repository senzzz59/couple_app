import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DatePicker } from '@/components/DatePicker';
import { Envelope } from '@/components/Envelope';
import { toast } from '@/components/motion';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetScreen } from '@/components/Screen';
import { Button, Chip, Field, Row, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { fmtDate, fmtFullDate, toDay, today } from '@/lib/dates';
import { upcomingEvents } from '@/lib/events';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Anniversary } from '@/lib/types';
import { colors, fonts, radius, springs } from '@/theme';

const addMonths = (n: number) => {
  const d = today();
  d.setMonth(d.getMonth() + n);
  return toDay(d);
};

/** 封存动画：信纸滑进信封 → 封口合上 → 火漆印盖下 */
function SealOverlay({ unlockAt }: { unlockAt: string }) {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(2);
  const seal = useSharedValue(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    progress.set(withSequence(withDelay(150, withTiming(1, { duration: 520 })), withTiming(0, { duration: 420 })));
    seal.set(
      withDelay(
        1150,
        withSpring(1, springs.bouncy, (fin) => {
          if (!fin) return;
          scheduleOnRN(haptic.heavy);
          scheduleOnRN(setDone, true);
        })
      )
    );
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/capsules')), 2600);
    return () => clearTimeout(t);
  }, [progress, seal]);
  const w = Math.min(width - 100, 280);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
      <View style={{ paddingTop: w * 0.5 }}>
        <Envelope width={w} progress={progress} seal={seal} />
      </View>
      {done && (
        <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center', marginTop: 36, gap: 6 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink }}>Sealed.</Text>
          <Txt v="caption">{fmtFullDate(unlockAt)} 见</Txt>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export default function NewCapsule() {
  const { space } = useCouple();
  const anns = useQuery<Anniversary[]>('/api/anniversaries');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [unlockAt, setUnlockAt] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sealed, setSealed] = useState(false);

  const presets = useMemo(() => {
    const next = upcomingEvents(anns.data, space?.startDate, true).find((e) => e.daysLeft >= 1);
    return [
      ...(next ? [{ label: `${next.emoji} ${next.title}`, value: toDay(next.date) }] : []),
      { label: '一个月后', value: addMonths(1) },
      { label: '半年后', value: addMonths(6) },
      { label: '一年后', value: addMonths(12) },
      { label: '三年后', value: addMonths(36) },
    ];
  }, [anns.data, space?.startDate]);

  const seal = async () => {
    if (!title.trim() || !content.trim()) return toast('标题和内容都要写');
    if (!unlockAt) return toast('选一个打开的日子', '📅');
    setSaving(true);
    try {
      const names = await uploadImages(photos.map((p) => p.local!).filter(Boolean));
      await api.post('/api/capsules', { title: title.trim(), content: content.trim(), photos: names, unlockAt });
      invalidate('capsules');
      setSealed(true);
    } catch (e) {
      toast((e as Error).message, '⚠️');
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetScreen title="时光胶囊">
        <Field value={title} onChangeText={setTitle} placeholder="给这封信起个名字，比如「三周年再看」" maxLength={40} />
        <View style={styles.paper}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={'亲爱的你，\n\n等你打开这封信的时候…'}
            placeholderTextColor={colors.faint}
            multiline
            maxLength={10000}
            style={styles.letter}
          />
        </View>
        <PhotoPicker value={photos} onChange={setPhotos} max={9} size={84} />

        <View style={{ gap: 10 }}>
          <Txt v="label" style={{ marginLeft: 4 }}>
            哪天打开
          </Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                active={!custom && unlockAt === p.value}
                onPress={() => {
                  setCustom(false);
                  setUnlockAt(p.value);
                }}
              />
            ))}
            <Chip label="自定义" active={custom} onPress={() => setCustom(true)} />
          </Row>
          {custom && (
            <Animated.View entering={FadeInDown.springify()}>
              <DatePicker value={unlockAt} onChange={(d) => (d > toDay(today()) ? setUnlockAt(d) : toast('要选今天之后的日子', '📅'))} />
            </Animated.View>
          )}
        </View>

        {unlockAt && (
          <Animated.View entering={FadeIn} style={styles.notice}>
            <Lock size={16} color={colors.inkSoft} />
            <Txt v="caption" color={colors.inkSoft} style={{ flex: 1 }}>
              封存后不能修改，{fmtDate(unlockAt)} 才能打开
            </Txt>
          </Animated.View>
        )}
        <Button title="封存" icon={Lock} onPress={seal} loading={saving} />
      </SheetScreen>
      {sealed && unlockAt && <SealOverlay unlockAt={unlockAt} />}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, minHeight: 260, borderWidth: 1, borderColor: colors.line },
  letter: { fontSize: 17, lineHeight: 30, color: colors.ink, minHeight: 220, textAlignVertical: 'top' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 14 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
