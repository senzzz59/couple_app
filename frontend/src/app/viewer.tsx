import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Download, FolderPlus, Heart, ImageDown, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumPicker } from '@/components/AlbumPicker';
import { LivePhoto } from '@/components/Media';
import { toast } from '@/components/motion';
import { goBack } from '@/components/Screen';
import { IconButton, PressScale, Row, Txt } from '@/components/ui';
import { Video } from '@/components/Video';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { fmtSize, mediaUrl } from '@/lib/media';
import { useCouple } from '@/lib/session';
import { invalidate } from '@/lib/store';
import { saveEntry, viewerSession, type ViewerEntry, type ViewerSession } from '@/lib/viewer';
import { colors, radius } from '@/theme';

const fmtWhen = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 全屏查看：左右滑动翻页，图片 / 视频 / Live 图都能看；相册里的还能收藏、加入相册、删除 */
export default function Viewer() {
  const params = useLocalSearchParams<{ photos?: string; index?: string }>();
  // 旧入口：?photos=a.jpg,b.jpg
  const [session] = useState<ViewerSession | null>(() => {
    const s = viewerSession();
    if (s) return s;
    const list = (params.photos ?? '').split(',').filter(Boolean);
    return list.length ? { items: list.map((image) => ({ kind: 'image', image })), index: Number(params.index) || 0, mode: 'plain' } : null;
  });
  const [items, setItems] = useState<ViewerEntry[]>(session?.items ?? []);
  const [cur, setCur] = useState(Math.min(session?.index ?? 0, Math.max(0, (session?.items.length ?? 1) - 1)));
  const [chrome, setChrome] = useState(true);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ViewerEntry>>(null);
  const { userName } = useCouple();
  const mode = session?.mode ?? 'plain';
  const item = items[cur];

  useEffect(() => {
    if (!session || !items.length) goBack();
  }, [session, items.length]);

  const go = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    if (next === cur) return;
    list.current?.scrollToIndex({ index: next, animated: true });
    setCur(next);
  };

  // 电脑上：方向键翻页，Esc 关闭
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(cur + 1);
      else if (e.key === 'ArrowLeft') go(cur - 1);
      else if (e.key === 'Escape') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const save = async () => {
    setSaving(true);
    try {
      const r = await saveEntry(item);
      if (r === 'downloaded') toast(item.original ? '开始下载原图' : '开始下载');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async () => {
    if (!item.id) return;
    const favorite = !item.favorite;
    haptic.tap();
    setItems((xs) => xs.map((x, i) => (i === cur ? { ...x, favorite } : x)));
    try {
      await api.patch(`/api/gallery/${item.id}`, { favorite });
      invalidate('gallery');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const remove = async () => {
    if (!item.id || !(await confirm('从相册删除？', '两个人的相册里都会删除，所在的所有相册里也会一起消失'))) return;
    try {
      await api.post('/api/gallery/batch', { ids: [item.id], action: 'delete' });
      haptic.success();
      invalidate('gallery');
      const next = items.filter((_, i) => i !== cur);
      setItems(next);
      setCur((c) => Math.min(c, next.length - 1));
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const importToGallery = async () => {
    try {
      await api.post('/api/gallery/import', { media: [{ kind: item.kind, image: item.image, video: item.video, w: item.w, h: item.h, duration: item.duration }], takenAt: session?.takenAt });
      haptic.success();
      toast('已存入相册', '✓');
      invalidate('gallery');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const page = ({ item: e, index }: { item: ViewerEntry; index: number }) => {
    const active = index === cur;
    const box = { width, height };
    return (
      <Pressable onPress={() => setChrome((c) => !c)} style={[box, { justifyContent: 'center', alignItems: 'center' }]}>
        {e.kind === 'video' && e.video ? (
          active ? (
            <Video uri={mediaUrl(e.video)!} poster={mediaUrl(e.image)} autoPlay style={{ width, height: height - insets.top - insets.bottom - 140 }} />
          ) : (
            <Image source={mediaUrl(e.image, 'thumb')} style={{ width, height: height * 0.8 }} contentFit="contain" />
          )
        ) : e.kind === 'live' && e.video ? (
          <LivePhoto key={active ? 'a' : 'i'} item={e} fit="contain" autoPlay={active} onPress={() => setChrome((c) => !c)} style={{ width, height: height * 0.8 }} />
        ) : (
          <Image source={mediaUrl(e.image)} placeholder={mediaUrl(e.image, 'thumb')} style={{ width, height: height * 0.8 }} contentFit="contain" transition={200} />
        )}
      </Pressable>
    );
  };

  const who = item.createdBy ? userName(item.createdBy) : '';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' }}>
      <FlatList
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={cur}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(x, i) => `${x.id ?? x.image ?? x.video}-${i}`}
        onMomentumScrollEnd={(e) => setCur(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={Platform.OS === 'web' ? (e) => setCur(Math.round(e.nativeEvent.contentOffset.x / width)) : undefined}
        scrollEventThrottle={64}
        renderItem={page}
      />

      {chrome && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong" color={colors.white}>
              {items.length > 1 ? `${cur + 1} / ${items.length}` : ' '}
            </Txt>
            {(item.takenAt || who) && (
              <Txt v="caption" color="rgba(255,255,255,0.65)">
                {[fmtWhen(item.takenAt), who && `${who} 上传`, fmtSize(item.size)].filter(Boolean).join(' · ')}
              </Txt>
            )}
          </View>
          <IconButton icon={X} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={goBack} label="关闭" />
        </Animated.View>
      )}

      {chrome && Platform.OS === 'web' && width > 700 && items.length > 1 && (
        <>
          {cur > 0 && (
            <View style={[styles.arrow, { left: 16 }]}>
              <IconButton icon={ChevronLeft} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={() => go(cur - 1)} />
            </View>
          )}
          {cur < items.length - 1 && (
            <View style={[styles.arrow, { right: 16 }]}>
              <IconButton icon={ChevronRight} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={() => go(cur + 1)} />
            </View>
          )}
        </>
      )}

      {chrome && mode !== 'plain' && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <Row gap={10} style={{ justifyContent: 'center' }}>
            <Action icon={Platform.OS === 'web' && /iPhone|iPad|Android/i.test(globalThis.navigator?.userAgent ?? '') ? ImageDown : Download} label={saving ? '准备中…' : item.original ? '保存原图' : '保存'} onPress={save} />
            {mode === 'gallery' && item.id && (
              <>
                <Action icon={Heart} label={item.favorite ? '已收藏' : '收藏'} active={item.favorite} onPress={toggleFavorite} />
                <Action icon={FolderPlus} label="放进相册" onPress={() => setPicker(true)} />
                <Action icon={Trash2} label="删除" onPress={remove} />
              </>
            )}
            {mode === 'moment' && <Action icon={FolderPlus} label="存进相册" onPress={importToGallery} />}
          </Row>
        </Animated.View>
      )}
      {mode === 'plain' && chrome && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <Row style={{ justifyContent: 'center' }}>
            <Action icon={Download} label="保存" onPress={save} />
          </Row>
        </View>
      )}
      {item.id && <AlbumPicker visible={picker} onClose={() => setPicker(false)} ids={[item.id]} exclude={session?.albumId} />}
    </Animated.View>
  );
}

function Action({ icon: Icon, label, onPress, active }: { icon: typeof Heart; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressScale onPress={onPress} style={styles.action}>
      <Icon size={20} color={active ? colors.accent : colors.white} fill={active ? colors.accent : 'transparent'} strokeWidth={2} />
      <Txt v="caption" color="rgba(255,255,255,0.85)" style={{ fontSize: 11 }}>
        {label}
      </Txt>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12 },
  arrow: { position: 'absolute', top: '50%', marginTop: -22 },
  action: { minWidth: 70, alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)' },
});
