import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { BookmarkCheck, ImagePlus, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/components/motion';
import { goBack } from '@/components/Screen';
import { IconButton, PressScale, Row, Txt } from '@/components/ui';
import { Video, type VideoHandle } from '@/components/Video';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { mediaUrl } from '@/lib/media';
import { invalidate } from '@/lib/store';
import type { GalleryItem } from '@/lib/types';
import { entryChanged, galleryEntry } from '@/lib/viewer';
import { colors, radius } from '@/theme';

type Strip = { strip: string; frames: number; duration: number };

const STRIP_H = 64;
const SIDE = 20;

/**
 * Live 图编辑：拖动下面的胶片条选一帧，
 * 「设为封面」把这一帧换成 Live 图的静态照片；「导出为照片」另存成一张普通照片。
 * 截帧在服务器上做（原尺寸、所有手机都一样）。
 */
export default function LiveEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<GalleryItem | null>(null);
  const [strip, setStrip] = useState<Strip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState<'cover' | 'photo' | null>(null);
  const video = useRef<VideoHandle>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<GalleryItem>(`/api/gallery/${id}`)
      .then(setItem)
      .catch((e) => setError((e as Error).message));
    api
      .get<Strip>(`/api/gallery/${id}/strip`)
      .then(setStrip)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const duration = strip?.duration ?? item?.duration ?? 0;
  const frames = strip?.frames ?? 10;
  const stripW = Math.min(width, 640) - SIDE * 2;
  const cellW = stripW / frames;
  // 选框的左边：0 秒在最左，结尾时选框贴着右边
  const boxX = duration ? (at / duration) * (stripW - cellW) : 0;

  const pick = (x: number) => {
    if (!duration) return;
    const t = Math.max(0, Math.min(duration, ((x - cellW / 2) / (stripW - cellW)) * duration));
    setAt(t);
  };
  // 预览停在选中的那一帧
  useEffect(() => video.current?.seek(at), [at]);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => pick(e.x))
    .onUpdate((e) => pick(e.x))
    .onEnd(() => haptic.tick());

  const run = async (action: 'cover' | 'photo') => {
    if (!id || busy) return;
    setBusy(action);
    try {
      const row = await api.post<GalleryItem>(`/api/gallery/${id}/frame`, { at: Math.round(at * 1000) / 1000, action });
      haptic.success();
      invalidate('gallery');
      if (action === 'cover') {
        setItem(row);
        entryChanged(galleryEntry(row));
        toast('已设为封面', '✓');
      } else {
        toast('已存成一张照片', '✓', '放在这张 Live 图旁边');
      }
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setBusy(null);
    }
  };

  // 预览区域：按视频比例放进中间剩下的地方
  const areaH = Math.max(200, height - insets.top - 64 - (insets.bottom + 24 + STRIP_H + 96));
  const ratio = item?.width && item?.height ? item.width / item.height : 3 / 4;
  const box = ratio > width / areaH ? { width, height: width / ratio } : { width: areaH * ratio, height: areaH };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <IconButton icon={X} bg={colors.surfaceAlt} onPress={goBack} label="关闭" />
        <Txt v="bodyStrong">编辑 Live 图</Txt>
        <View style={{ width: 44 }} />
      </Row>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {item?.video ? (
          <View style={[box, { backgroundColor: '#000', overflow: 'hidden' }]}>
            {Platform.OS === 'web' ? (
              <Video ref={video} uri={mediaUrl(item.video)!} poster={mediaUrl(item.image)} controls={false} muted fit="contain" style={StyleSheet.absoluteFill} />
            ) : (
              // App 里还没有内置播放器：显示当前封面
              <Image source={mediaUrl(item.image)} style={StyleSheet.absoluteFill} contentFit="contain" />
            )}
          </View>
        ) : error ? (
          <Txt v="secondary" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
            {error}
          </Txt>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        {/* 选框上方的两个按钮（像系统相册的「设为封面 / 导出」） */}
        <View style={{ width: stripW, height: 84 }}>
          {strip && (
            <View style={[styles.bubble, { left: Math.max(0, Math.min(stripW - 196, boxX + cellW / 2 - 98)) }]}>
              <BubbleAction icon={BookmarkCheck} label={busy === 'cover' ? '设置中…' : '设为封面'} onPress={() => run('cover')} />
              <View style={styles.bubbleLine} />
              <BubbleAction icon={ImagePlus} label={busy === 'photo' ? '导出中…' : '导出为照片'} onPress={() => run('photo')} />
            </View>
          )}
        </View>
        <GestureDetector gesture={pan}>
          <View style={[styles.strip, { width: stripW }]}>
            {strip ? <Image source={strip.strip} style={StyleSheet.absoluteFill} contentFit="fill" /> : <ActivityIndicator color={colors.muted} style={{ marginTop: 22 }} />}
            {strip && <View pointerEvents="none" style={[styles.box, { left: boxX, width: cellW }]} />}
          </View>
        </GestureDetector>
        <Txt v="caption" style={{ marginTop: 10 }}>
          {strip ? `左右拖动选一帧 · ${at.toFixed(1)} 秒` : '正在读取 Live 图…'}
        </Txt>
      </View>
    </Animated.View>
  );
}

function BubbleAction({ icon: Icon, label, onPress }: { icon: typeof X; label: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={styles.bubbleAction} accessibilityLabel={label}>
      <Icon size={22} color={colors.white} />
      <Txt v="caption" color={colors.white} style={{ fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
        {label}
      </Txt>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  top: { justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  strip: { height: STRIP_H, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 3, borderColor: colors.accent },
  box: { position: 'absolute', top: 0, bottom: 0, borderWidth: 3, borderColor: colors.white, borderRadius: 6 },
  bubble: { position: 'absolute', bottom: 8, width: 196, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentStrong, borderRadius: radius.md, paddingVertical: 8 },
  bubbleAction: { flex: 1, alignItems: 'center', gap: 4 },
  bubbleLine: { width: StyleSheet.hairlineWidth * 2, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.4)' },
});
