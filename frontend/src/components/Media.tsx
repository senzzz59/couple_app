import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { fmtDuration, mediaUrl } from '@/lib/media';
import type { MediaItem } from '@/lib/types';
import { openViewer, type ViewerEntry } from '@/lib/viewer';
import { colors, radius } from '@/theme';

import { PressScale } from './ui';
import { Video, type VideoHandle } from './Video';

/** 左上角的 LIVE 标记（和 iPhone 相册一样的同心圆） */
export function LiveBadge({ light = true, small }: { light?: boolean; small?: boolean }) {
  const c = light ? '#fff' : colors.ink;
  const s = small ? 12 : 14;
  return (
    <View style={[styles.badge, small && { paddingHorizontal: 5, height: 18 }, !light && { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
      <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: 1.2, borderColor: c, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s, backgroundColor: c }} />
      </View>
      <Text style={{ color: c, fontSize: small ? 9 : 10, fontWeight: '800', letterSpacing: 0.6 }}>LIVE</Text>
    </View>
  );
}

export function VideoBadge({ duration, small }: { duration?: number | null; small?: boolean }) {
  return (
    <View style={[styles.badge, small && { paddingHorizontal: 5, height: 18 }]}>
      <Play size={small ? 9 : 11} color="#fff" fill="#fff" />
      {!!duration && <Text style={{ color: '#fff', fontSize: small ? 10 : 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtDuration(duration)}</Text>}
    </View>
  );
}

/** 小方块缩略图：图片 / 视频封面，带类型角标 */
export function MediaThumb({ item, size, style, radius: r = 10 }: { item: MediaItem; size: number | `${number}%`; style?: StyleProp<ViewStyle>; radius?: number }) {
  const thumb = mediaUrl(item.image, 'thumb');
  return (
    <View style={[{ width: size, aspectRatio: 1, borderRadius: r, overflow: 'hidden', backgroundColor: colors.surfaceAlt }, style]}>
      {thumb ? (
        // 网页上滚到附近才加载：相册一次列出几百张时不会同时去下载所有缩略图
        <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} recyclingKey={item.image ?? undefined} loading="lazy" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPoster]}>
          <Play size={22} color={colors.muted} />
        </View>
      )}
      {item.kind === 'video' && (
        <View style={styles.corner}>
          <VideoBadge duration={item.duration} small />
        </View>
      )}
      {item.kind === 'live' && (
        <View style={[styles.topLeft, { left: 5, top: 5 }]}>
          <LiveBadge small />
        </View>
      )}
    </View>
  );
}

/**
 * Live 图：平时是静态照片，按住（电脑上鼠标移上去）播放动态部分。
 * autoPlay：打开时先自动播放一次（和 iPhone 相册一样）。
 */
export function LivePhoto({ item, style, fit = 'cover', autoPlay, onPress, label, children, glow = true }: { item: MediaItem; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain'; autoPlay?: boolean; onPress?: () => void; label?: string; children?: React.ReactNode; /** 播放时描一圈白边（全屏查看时不要） */ glow?: boolean }) {
  const [mounted, setMounted] = useState(!!autoPlay);
  const [playing, setPlaying] = useState(false);
  const video = useRef<VideoHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    setMounted(true);
    // 视频挂载后再播
    setTimeout(() => video.current?.restart(), 30);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setPlaying(false);
    video.current?.pause();
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <Pressable
      onPressIn={() => {
        timer.current = setTimeout(start, 160);
      }}
      onPressOut={stop}
      onPress={onPress}
      accessibilityLabel={label ?? 'Live 图，按住播放'}
      onHoverIn={start}
      onHoverOut={stop}
      style={[{ overflow: 'hidden' }, style]}>
      <Image source={mediaUrl(item.image)} placeholder={mediaUrl(item.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit={fit} transition={200} />
      {mounted && item.video && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: playing ? 1 : 0 }]}>
          <Video ref={video} uri={mediaUrl(item.video)!} controls={false} muted autoPlay={autoPlay} fit={fit} style={StyleSheet.absoluteFill} onPlaying={() => setPlaying(true)} onEnded={() => setPlaying(false)} />
        </View>
      )}
      <View style={[styles.topLeft, { left: 8, top: 8 }]}>
        <LiveBadge />
      </View>
      {playing && glow && <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} pointerEvents="none" style={styles.liveGlow} />}
      {children}
    </Pressable>
  );
}

const KIND_LABEL = { image: '照片', video: '视频', live: 'Live 图' } as const;

const toEntries = (items: MediaItem[]): ViewerEntry[] => items.map((m) => ({ ...m }));

/** 朋友圈式媒体九宫格：1 项按原比例显示，2/4 项两列，其余三列 */
export function MediaGrid({ items, width, takenAt }: { items: MediaItem[]; width: number; takenAt?: string }) {
  if (!items.length) return null;
  const open = (i: number) => openViewer(toEntries(items), i, { mode: 'moment', takenAt });
  if (items.length === 1) {
    const m = items[0];
    const ratio = m.w && m.h ? Math.min(16 / 9, Math.max(3 / 4, m.w / m.h)) : 4 / 5;
    const w = ratio >= 1 ? width * 0.86 : width * 0.68;
    const box = { width: w, aspectRatio: ratio, borderRadius: radius.md };
    if (m.kind === 'live') {
      return (
        <LivePhoto item={m} style={box} onPress={() => open(0)} label={KIND_LABEL.live} />
      );
    }
    return (
      <PressScale haptics={false} onPress={() => open(0)} accessibilityRole="imagebutton" accessibilityLabel={KIND_LABEL[m.kind]} style={[box, { overflow: 'hidden', backgroundColor: colors.surfaceAlt }]}>
        {m.image ? (
          <Image source={mediaUrl(m.image)} placeholder={mediaUrl(m.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noPoster]} />
        )}
        {m.kind === 'video' && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={styles.bigPlay}>
              <Play size={26} color="#fff" fill="#fff" />
            </View>
            <View style={styles.corner}>
              <VideoBadge duration={m.duration} />
            </View>
          </View>
        )}
      </PressScale>
    );
  }
  const cols = items.length === 2 || items.length === 4 ? 2 : 3;
  const gap = 4;
  const cell = Math.floor((width - gap * (cols - 1)) / cols);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width }}>
      {items.map((m, i) => (
        <PressScale key={`${m.image ?? m.video}-${i}`} haptics={false} onPress={() => open(i)} accessibilityRole="imagebutton" accessibilityLabel={KIND_LABEL[m.kind]}>
          <MediaThumb item={m} size={cell} />
        </PressScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: 'rgba(30,20,24,0.45)' },
  corner: { position: 'absolute', right: 6, bottom: 6 },
  // 单独一个样式：在数组里写 right: undefined 并不能覆盖掉 corner 的 right
  topLeft: { position: 'absolute' },
  noPoster: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  bigPlay: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(30,20,24,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  liveGlow: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: 'rgba(255,255,255,0.65)', borderRadius: radius.md },
});
