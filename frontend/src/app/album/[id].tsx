import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ImagePlus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumEditor } from '@/components/AlbumEditor';
import { AlbumPicker } from '@/components/AlbumPicker';
import { GalleryGrid, UploadBanner } from '@/components/GalleryGrid';
import { toast } from '@/components/motion';
import { CENTERED, goBack } from '@/components/Screen';
import { SelectionBar } from '@/components/SelectionBar';
import { Sheet } from '@/components/Sheet';
import { LoadError, QueryFallback } from '@/components/Skeleton';
import { Button, Empty, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { uploadToGallery } from '@/lib/galleryUpload';
import { useGallerySelection } from '@/lib/gallerySelection';
import { haptic } from '@/lib/haptics';
import { mediaUrl } from '@/lib/media';
import { invalidate, useQuery } from '@/lib/store';
import type { Album, GalleryItem } from '@/lib/types';
import { galleryEntry, openViewer } from '@/lib/viewer';
import { colors, radius } from '@/theme';

const SMART: Record<string, { title: string; emoji: string; query: string }> = {
  favorites: { title: '收藏', emoji: '❤️', query: '&favorite=1' },
  videos: { title: '视频', emoji: '🎬', query: '&kind=video' },
  live: { title: 'Live 图', emoji: '◎', query: '&kind=live' },
};
const HERO = 260;

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const smart = SMART[id];
  const insets = useSafeAreaInsets();
  const albums = useQuery<Album[]>(smart ? null : '/api/albums');
  const album = albums.data?.find((a) => a.id === id);
  const list = useQuery<GalleryItem[]>(`/api/gallery?limit=3000${smart ? smart.query : `&album=${id}`}`);
  const items = list.data ?? [];
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const sel = useGallerySelection(items, { albumId: smart ? undefined : id, onPickAlbum: () => setPicker(true) });

  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(y.value, [-HERO, 0, HERO], [-HERO / 2, 0, HERO * 0.45]) }, { scale: interpolate(y.value, [-HERO, 0], [1.8, 1], 'clamp') }] }));
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [HERO - 120, HERO - 60], [0, 1], 'clamp') }));

  if (!smart && albums.data && !album) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <LoadError message="这个相册已经被删除了" onRetry={goBack} />
      </View>
    );
  }

  const title = smart?.title ?? album?.title ?? '';
  const emoji = smart?.emoji ?? album?.emoji ?? '📷';
  const cover = album?.cover ?? (smart ? items[0] : null);

  const removeAlbum = async () => {
    if (!album || !(await confirm(`删除相册「${album.title}」？`, '只删除相册，里面的照片还在「全部照片」里', '删除相册'))) return;
    try {
      await api.del(`/api/albums/${album.id}`);
      haptic.success();
      invalidate('albums');
      goBack();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    }
  };

  const upload = () => uploadToGallery(smart ? undefined : id).catch((e) => toast((e as Error).message, '⚠️'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.View style={[styles.hero, heroStyle]}>
        {cover?.image ? <Image source={mediaUrl(cover.image)} placeholder={mediaUrl(cover.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.pink }]} />}
        <LinearGradient colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.35)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: HERO - 36, paddingBottom: insets.bottom + 120 }}>
        <View style={styles.sheet}>
          <View style={CENTERED}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Txt v="title">
                  {emoji} {title}
                </Txt>
                <Txt v="caption">
                  {items.length} 项{album?.description ? ` · ${album.description}` : ''}
                </Txt>
              </View>
              {sel.selecting ? (
                <Row gap={8}>
                  <Button title={sel.allSelected ? '全不选' : '全选'} variant="secondary" onPress={sel.selectAll} style={styles.btn} />
                  <Button title="完成" onPress={sel.stop} style={styles.btn} />
                </Row>
              ) : (
                <Row gap={8}>
                  {items.length > 0 && <Button title="选择" variant="secondary" onPress={() => sel.start()} style={styles.btn} />}
                  {!smart && <IconButton icon={MoreHorizontal} bg={colors.surfaceAlt} onPress={() => setMenu(true)} size={38} />}
                </Row>
              )}
            </Row>

            {!smart && !sel.selecting && (
              <Row gap={10} style={{ marginTop: 16 }}>
                <Button title="上传到这里" icon={ImagePlus} onPress={upload} style={{ flex: 1, height: 46 }} />
                <Button title="从相册添加" icon={Plus} variant="secondary" onPress={() => router.push({ pathname: '/album/add', params: { album: id } })} style={{ flex: 1, height: 46 }} />
              </Row>
            )}

            <View style={{ marginTop: 18 }}>
              <UploadBanner />
              <QueryFallback q={list} kind="grid" count={6} />
              {list.data && items.length === 0 ? (
                <Empty emoji={emoji} title="这里还空空的"  />
              ) : (
                <GalleryGrid
                  items={items}
                  selecting={sel.selecting}
                  selected={sel.selected}
                  onToggle={sel.toggle}
                  onStartSelect={sel.start}
                  onOpen={(i) => openViewer(items.map(galleryEntry), i, { mode: 'gallery', albumId: smart ? undefined : id })}
                />
              )}
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      <Animated.View pointerEvents="none" style={[styles.topBar, { height: insets.top + 52 }, barStyle]}>
        <Txt v="bodyStrong" style={{ marginBottom: 14 }}>
          {title}
        </Txt>
      </Animated.View>
      <View style={{ position: 'absolute', top: insets.top + 6, left: 12 }}>
        <IconButton icon={ChevronLeft} onPress={goBack} label="返回" />
      </View>

      {sel.selecting && <SelectionBar count={sel.selected.size} actions={sel.actions} />}
      <AlbumPicker visible={picker} onClose={() => setPicker(false)} onAdded={sel.stop} ids={sel.ids} exclude={smart ? undefined : id} />
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <View style={styles.menu}>
          <PressScale
            onPress={() => {
              setMenu(false);
              setEditing(true);
            }}
            style={styles.menuItem}>
            <Pencil size={19} color={colors.inkSoft} />
            <Txt v="bodyStrong">改名字 / 描述</Txt>
          </PressScale>
          <PressScale
            onPress={() => {
              setMenu(false);
              removeAlbum();
            }}
            style={[styles.menuItem, styles.menuSep]}>
            <Trash2 size={19} color={colors.danger} />
            <Txt v="bodyStrong" color={colors.danger}>
              删除相册
            </Txt>
          </PressScale>
        </View>
        <Button title="取消" variant="secondary" onPress={() => setMenu(false)} />
      </Sheet>
      <AlbumEditor visible={editing} onClose={() => setEditing(false)} album={album} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO, overflow: 'hidden' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, minHeight: 500 },
  btn: { height: 38, paddingHorizontal: 14 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: 'rgba(255,247,245,0.96)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  menu: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  menuSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
