import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CircleDot, Heart, ImagePlus, Play, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AlbumEditor } from '@/components/AlbumEditor';
import { AlbumPicker } from '@/components/AlbumPicker';
import { GalleryGrid, UploadBanner } from '@/components/GalleryGrid';
import { Segmented, toast } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { SelectionBar } from '@/components/SelectionBar';
import { QueryFallback } from '@/components/Skeleton';
import { Button, Chip, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { uploadToGallery } from '@/lib/galleryUpload';
import { useGallerySelection } from '@/lib/gallerySelection';
import { mediaUrl } from '@/lib/media';
import { invalidate, useQuery } from '@/lib/store';
import type { Album, GalleryItem, GallerySummary } from '@/lib/types';
import { galleryEntry, openViewer } from '@/lib/viewer';
import { colors, radius, shadow } from '@/theme';

type Filter = 'all' | 'favorite' | 'video' | 'live';
const PAGE = 300;

const filterQuery = (f: Filter) => (f === 'favorite' ? '&favorite=1' : f === 'video' ? '&kind=video' : f === 'live' ? '&kind=live' : '');

function AlbumCard({ a, size }: { a: Album; size: number }) {
  return (
    <PressScale onPress={() => router.push({ pathname: '/album/[id]', params: { id: a.id } })} style={{ width: size }}>
      <View style={[styles.albumCover, { width: size, height: size }]}>
        {a.cover?.image ? <Image source={mediaUrl(a.cover.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Text style={{ fontSize: size * 0.3 }}>{a.emoji ?? '📷'}</Text>}
      </View>
      <Txt v="bodyStrong" numberOfLines={1} style={{ marginTop: 8, paddingHorizontal: 2 }}>
        {a.cover?.image && a.emoji ? `${a.emoji} ` : ''}
        {a.title}
      </Txt>
      <Txt v="caption" style={{ paddingHorizontal: 2 }}>
        {a.count} 项
      </Txt>
    </PressScale>
  );
}

function SmartAlbum({ icon: Icon, label, count, cover, onPress }: { icon: typeof Heart; label: string; count: number; cover: GalleryItem | null; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={styles.smart}>
      <View style={styles.smartCover}>
        {cover?.image ? <Image source={mediaUrl(cover.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.smartIcon}>
          <Icon size={14} color={colors.white} fill={Icon === Heart ? colors.white : 'transparent'} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 2 }}>
        <Txt v="bodyStrong" style={{ fontSize: 15 }}>
          {label}
        </Txt>
        <Txt v="secondary">{count}</Txt>
      </View>
    </PressScale>
  );
}

function Albums() {
  const albums = useQuery<Album[]>('/api/albums');
  const summary = useQuery<GallerySummary>('/api/gallery/summary');
  const [creating, setCreating] = useState(false);
  const { width } = useWindowDimensions();
  const w = Math.min(width, 720) - 32;
  const cols = w > 560 ? 3 : 2;
  const size = Math.floor((w - 14 * (cols - 1)) / cols);
  const s = summary.data;
  return (
    <View style={{ gap: 18 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
        <SmartAlbum icon={Heart} label="收藏" count={s?.favorites ?? 0} cover={s?.covers.favorites ?? null} onPress={() => router.push({ pathname: '/album/[id]', params: { id: 'favorites' } })} />
        <SmartAlbum icon={Play} label="视频" count={s?.videos ?? 0} cover={s?.covers.videos ?? null} onPress={() => router.push({ pathname: '/album/[id]', params: { id: 'videos' } })} />
        <SmartAlbum icon={CircleDot} label="Live 图" count={s?.live ?? 0} cover={s?.covers.live ?? null} onPress={() => router.push({ pathname: '/album/[id]', params: { id: 'live' } })} />
      </ScrollView>

      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Txt v="heading" style={{ fontSize: 17 }}>
          我们的相册
        </Txt>
        <Txt v="caption">{albums.data?.length ?? 0} 个</Txt>
      </Row>
      <QueryFallback q={albums} kind="grid" count={2} />
      {albums.data && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          <PressScale onPress={() => setCreating(true)} style={{ width: size }}>
            <View style={[styles.albumCover, styles.newAlbum, { width: size, height: size }]}>
              <Plus size={30} color={colors.accentStrong} />
              <Txt v="bodyStrong" color={colors.pinkInk}>
                新建相册
              </Txt>
            </View>
          </PressScale>
          {albums.data.map((a, i) => (
            <Animated.View key={a.id} entering={enter(i)}>
              <AlbumCard a={a} size={size} />
            </Animated.View>
          ))}
        </View>
      )}
      <AlbumEditor visible={creating} onClose={() => setCreating(false)} onSaved={(a) => router.push({ pathname: '/album/[id]', params: { id: a.id } })} />
    </View>
  );
}

export default function Gallery() {
  const [tab, setTab] = useState<'photos' | 'albums'>('photos');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [picker, setPicker] = useState(false);
  const list = useQuery<GalleryItem[]>(`/api/gallery?limit=${limit}${filterQuery(filter)}`);
  const items = list.data ?? [];
  const sel = useGallerySelection(items, { onPickAlbum: () => setPicker(true) });

  const upload = () => uploadToGallery().catch((e) => toast((e as Error).message, '⚠️'));
  const right = sel.selecting ? (
    <Row gap={8}>
      <Button title={sel.allSelected ? '全不选' : '全选'} variant="secondary" onPress={sel.selectAll} style={styles.headerBtn} />
      <Button title="完成" onPress={sel.stop} style={styles.headerBtn} />
    </Row>
  ) : (
    <Row gap={8}>
      {tab === 'photos' && items.length > 0 && <Button title="选择" variant="secondary" onPress={() => sel.start()} style={styles.headerBtn} />}
      <IconButton icon={ImagePlus} onPress={upload} bg={colors.accentStrong} color={colors.white} label="上传照片或视频" />
    </Row>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen
        tab
        title={sel.selecting ? (sel.selected.size ? `已选 ${sel.selected.size} 项` : '选择照片') : '相册'}
        right={right}
        onRefresh={async () => {
          await Promise.all([invalidate('gallery'), invalidate('albums')]);
        }}>
        <UploadBanner />
        {!sel.selecting && (
          <Segmented
            options={[
              { key: 'photos', label: '照片' },
              { key: 'albums', label: '相册' },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}

        <View style={{ marginTop: sel.selecting ? 0 : 14 }}>
          {tab === 'albums' && !sel.selecting ? (
            <Albums />
          ) : (
            <>
              {!sel.selecting && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                  <Chip label="全部" active={filter === 'all'} onPress={() => setFilter('all')} />
                  <Chip label="收藏" active={filter === 'favorite'} onPress={() => setFilter('favorite')} />
                  <Chip label="视频" active={filter === 'video'} onPress={() => setFilter('video')} />
                  <Chip label="Live 图" active={filter === 'live'} onPress={() => setFilter('live')} />
                </ScrollView>
              )}
              <QueryFallback q={list} kind="grid" count={6} />
              {list.data && items.length === 0 ? (
                filter === 'all' ? (
                  <Empty emoji="🖼️" title="还没有照片" action={<Button title="上传照片和视频" icon={ImagePlus} onPress={upload} />} />
                ) : (
                  <Empty emoji={filter === 'favorite' ? '❤️' : '🎞️'} title={filter === 'favorite' ? '还没有收藏' : filter === 'video' ? '还没有视频' : '还没有 Live 图'} />
                )
              ) : (
                <GalleryGrid
                  items={items}
                  selecting={sel.selecting}
                  selected={sel.selected}
                  onToggle={sel.toggle}
                  onStartSelect={sel.start}
                  onOpen={(i) => openViewer(items.map(galleryEntry), i, { mode: 'gallery' })}
                />
              )}
              {items.length >= limit && <Button title="加载更多" variant="ghost" onPress={() => setLimit((l) => l + PAGE)} style={{ marginTop: 12 }} />}
              {sel.selecting && <View style={{ height: 90 }} />}
            </>
          )}
        </View>
      </Screen>
      {sel.selecting && <SelectionBar count={sel.selected.size} actions={sel.actions} aboveTabs />}
      <AlbumPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onAdded={sel.stop}
        ids={sel.ids}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: { height: 38, paddingHorizontal: 14 },
  albumCover: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', ...shadow },
  newAlbum: { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, gap: 6, shadowOpacity: 0 },
  smart: { width: 120, gap: 6 },
  smartCover: { width: 120, height: 86, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.pink },
  smartIcon: { position: 'absolute', left: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(30,20,24,0.4)', alignItems: 'center', justifyContent: 'center' },
});
