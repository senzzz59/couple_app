import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronDown, ImagePlus, MapPin, Smile, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { LiveBadge, VideoBadge } from '@/components/Media';
import { toast } from '@/components/motion';
import { SheetScreen } from '@/components/Screen';
import { Avatar, Button, Chip, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { pickMedia, releaseLocal, uploadMedia, type LocalMedia } from '@/lib/media';
import { MOODS } from '@/lib/nudge';
import { EmojiTile } from '@/components/EmojiTile';
import { useCouple } from '@/lib/session';
import { invalidate, useQuery } from '@/lib/store';
import type { Place } from '@/lib/types';
import { colors, radius, shadow } from '@/theme';

const DRAFT_KEY = 'draft.moment';
const MAX = 9;
const PROMPTS = ['今天想和 TA 分享什么？', '今天吃到了什么好吃的？', '刚刚在想什么？', '记录一下此刻吧'];

function Progress({ value, label }: { value: number; label: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(value, { duration: 250 }));
  }, [value, p]);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.02, p.value) }] }));
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut} style={styles.progress}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="bodyStrong" style={{ fontSize: 14 }}>
          {label}
        </Txt>
        <Txt v="caption">{Math.round(value * 100)}%</Txt>
      </Row>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
    </Animated.View>
  );
}

export default function NewMoment() {
  const { me } = useCouple();
  const places = useQuery<Place[]>('/api/places');
  const { width } = useWindowDimensions();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [toGallery, setToGallery] = useState(false);
  const [panel, setPanel] = useState<'mood' | 'place' | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  // 草稿：不小心关掉也不会丢字
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((d) => d && setContent((c) => c || d))
      .catch(() => {});
    return () => releaseLocal(mediaRef.current);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => (content ? AsyncStorage.setItem(DRAFT_KEY, content) : AsyncStorage.removeItem(DRAFT_KEY)).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [content]);

  const contentW = Math.min(width, 640) - 32;
  const cell = Math.floor((contentW - 16) / 3);
  const place = places.data?.find((p) => p.id === placeId);
  const canPost = !!content.trim() || media.length > 0;

  const add = async () => {
    setPicking(true);
    try {
      const picked = await pickMedia({ max: MAX - media.length });
      if (picked.length) {
        haptic.tap();
        setMedia((m) => [...m, ...picked].slice(0, MAX));
      }
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setPicking(false);
    }
  };

  const post = async () => {
    if (!canPost) return toast('写点什么，或者选张照片');
    setSaving(true);
    try {
      let uploaded: Awaited<ReturnType<typeof uploadMedia>> = [];
      if (media.length) {
        setProgress(0);
        uploaded = await uploadMedia(media, { onProgress: setProgress });
      }
      const items = uploaded.map((m) => ({ kind: m.kind, image: m.image, video: m.video, w: m.w ?? null, h: m.h ?? null, duration: m.duration ?? null }));
      await api.post('/api/moments', { content: content.trim() || null, media: items, mood, placeId });
      if (toGallery && items.length) await api.post('/api/gallery/import', { media: items }).catch(() => toast('动态已发布，存入相册失败', '⚠️'));
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      haptic.success();
      invalidate('moments');
      if (toGallery) invalidate('gallery');
      // 带了餐厅：服务器顺便记了一次探店
      if (placeId) {
        invalidate('visits');
        invalidate('places');
      }
      router.back();
      router.navigate('/moments');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const close = async () => {
    if (saving) return;
    if (media.length && !(await confirm('放弃这条动态？', '文字会保存为草稿，选好的照片 / 视频不会保留', '放弃', { cancelText: '继续编辑', tone: 'normal' }))) return;
    router.back();
  };

  return (
    <SheetScreen
      title="发动态"
      onClose={close}
      action={<Button title="发布" variant="accent" onPress={post} loading={saving} disabled={!canPost} style={{ height: 38, paddingHorizontal: 18 }} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <Avatar user={me} size={36} />
          <Txt v="bodyStrong">{me?.name}</Txt>
        </Row>
      </Row>

      <View>
        <TextInput
          autoFocus
          value={content}
          onChangeText={setContent}
          placeholder={prompt}
          placeholderTextColor={colors.faint}
          multiline
          maxLength={3000}
          style={styles.input}
        />
        {content.length > 2500 && (
          <Txt v="caption" style={{ textAlign: 'right' }}>
            {content.length}/3000
          </Txt>
        )}
      </View>

      {progress !== null && <Progress value={progress} label={progress < 1 ? `正在上传 ${media.length} 项…` : '马上就好'} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {media.map((m) => (
          <Animated.View key={m.key} entering={ZoomIn.springify().damping(15)} exiting={ZoomOut.duration(150)} layout={LinearTransition.springify().damping(18)}>
            <View style={[styles.tile, { width: cell, height: cell }]}>
              {m.uri ? <Image source={m.uri} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.noPreview]}><Txt v="caption">视频</Txt></View>}
              {m.kind === 'video' && (
                <View style={{ position: 'absolute', right: 6, bottom: 6 }}>
                  <VideoBadge duration={m.duration} small />
                </View>
              )}
              {m.kind === 'live' && (
                <View style={{ position: 'absolute', left: 6, top: 6 }}>
                  <LiveBadge small />
                </View>
              )}
            </View>
            {!saving && (
              <PressScale
                accessibilityLabel="移除"
                scaleTo={0.85}
                onPress={() => {
                  releaseLocal([m]);
                  setMedia((xs) => xs.filter((x) => x.key !== m.key));
                }}
                style={styles.remove}>
                <X size={12} color={colors.white} strokeWidth={3} />
              </PressScale>
            )}
          </Animated.View>
        ))}
        {media.length < MAX && (
          <Animated.View layout={LinearTransition.springify().damping(18)}>
            <PressScale onPress={add} disabled={picking || saving} style={[styles.add, { width: cell, height: cell }]}>
              <ImagePlus size={26} color={colors.accentStrong} />
              <Txt v="secondary" color={colors.pinkInk}>
                {picking ? '读取中…' : media.length ? `${media.length}/${MAX}` : '照片或视频'}
              </Txt>
            </PressScale>
          </Animated.View>
        )}
      </View>

      <View style={styles.options}>
        <PressScale haptics={false} onPress={() => setPanel(panel === 'mood' ? null : 'mood')} style={styles.option}>
          <Smile size={18} color={colors.inkSoft} />
          <Txt v="bodyStrong" style={{ flex: 1, fontSize: 15 }}>
            心情
          </Txt>
          <Txt v="secondary" style={mood ? { fontSize: 20, lineHeight: 26 } : undefined}>
            {mood ?? '选一个'}
          </Txt>
          <ChevronDown size={16} color={colors.muted} style={{ transform: [{ rotate: panel === 'mood' ? '180deg' : '0deg' }] }} />
        </PressScale>
        {panel === 'mood' && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.moodGrid}>
            {MOODS.map((m) => (
              <PressScale
                key={m}
                scaleTo={0.85}
                onPress={() => {
                  setMood(mood === m ? null : m);
                  setPanel(null);
                }}
                style={[styles.mood, mood === m && styles.moodOn]}>
                <Text style={{ fontSize: 24 }}>{m}</Text>
              </PressScale>
            ))}
            <EmojiTile
              value={mood}
              presets={MOODS}
              onChange={(e) => {
                setMood(e);
                setPanel(null);
              }}
              size={44}
              fontSize={24}
              style={styles.mood}
              activeStyle={styles.moodOn}
            />
          </Animated.View>
        )}
        <View style={styles.sep} />
        <PressScale haptics={false} onPress={() => setPanel(panel === 'place' ? null : 'place')} style={styles.option}>
          <MapPin size={18} color={colors.inkSoft} />
          <Txt v="bodyStrong" style={{ flex: 1, fontSize: 15 }}>
            在哪家店
          </Txt>
          <Txt v="secondary" numberOfLines={1} style={{ maxWidth: 160 }} color={place ? colors.inkSoft : colors.muted}>
            {place?.name ?? '不选'}
          </Txt>
          <ChevronDown size={16} color={colors.muted} style={{ transform: [{ rotate: panel === 'place' ? '180deg' : '0deg' }] }} />
        </PressScale>
        {panel === 'place' && (
          <Animated.View entering={FadeIn.duration(150)}>
            {places.data?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
                {places.data.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    active={placeId === p.id}
                    onPress={() => {
                      setPlaceId(placeId === p.id ? null : p.id);
                      setPanel(null);
                    }}
                  />
                ))}
              </ScrollView>
            ) : (
              <Txt v="caption" style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                还没有收藏的店
              </Txt>
            )}
          </Animated.View>
        )}
        {media.length > 0 && (
          <>
            <View style={styles.sep} />
            <View style={styles.option}>
              <ImagePlus size={18} color={colors.inkSoft} />
              <Txt v="bodyStrong" style={{ flex: 1, fontSize: 15 }}>
                同时存入相册
              </Txt>
              <Switch value={toGallery} onValueChange={setToGallery} trackColor={{ true: colors.accent, false: colors.line }} thumbColor={colors.white} {...({ activeThumbColor: colors.white } as object)} />
            </View>
          </>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 18, lineHeight: 27, color: colors.ink, minHeight: 110, textAlignVertical: 'top', paddingVertical: 4 },
  tile: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  noPreview: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  add: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 6 },
  options: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 54 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 44 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  mood: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  moodOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  progress: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 10, ...shadow },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, width: '100%', borderRadius: 4, backgroundColor: colors.accent, transformOrigin: 'left' },
});
