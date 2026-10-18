import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CalendarDays, CircleDot, Heart, ImagePlus, Play, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { AlbumEditor } from '@/components/AlbumEditor';
import { AlbumPicker } from '@/components/AlbumPicker';
import { GalleryGrid, UploadBanner } from '@/components/GalleryGrid';
import { Segmented, toast } from '@/components/motion';
import { MonthJump, type MonthCount } from '@/components/MonthJump';
import { PeerBanner, useGalleryPresence } from '@/components/PeerBanner';
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

type Filter = 'all' | 'image' | 'video' | 'live' | 'favorite';
const FILTERS: { key: Filter; label: string; empty: string; emoji: string }[] = [
  { key: 'all', label: '全部', empty: '还没有照片', emoji: '🖼️' },
  { key: 'image', label: '照片', empty: '还没有照片', emoji: '🖼️' },
  { key: 'video', label: '视频', empty: '还没有视频', emoji: '🎞️' },
  { key: 'live', label: 'Live 图', empty: '还没有 Live 图', emoji: '🎞️' },
  { key: 'favorite', label: '收藏', empty: '还没有收藏', emoji: '❤️' },
];
const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
})();
const PAGE = 300;

const filterQuery = (f: Filter) => (f === 'favorite' ? '&favorite=1' : f === 'all' ? '' : `&kind=${f}`);

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
  const presence = useGalleryPresence();

  // ---- 跳到某年某月：先把那个月之前（更新）的都加载出来，再滚到那个月
  const insets = useSafeAreaInsets();
  const months = useQuery<MonthCount[]>(tab === 'photos' ? `/api/gallery/months?tz=${encodeURIComponent(TZ)}${filterQuery(filter)}` : null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // 要跳去的月份：等它显示出来、量好位置再滚过去
  const target = useRef<string | null>(null);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const bodyY = useRef(0);
  const gridY = useRef(0);
  const monthY = useRef(new Map<string, number>());
  // 选择月份的弹层要完全收起再滚
  const sheetGone = useRef(true);
  const openJump = () => {
    // 网页上弹层关掉时会把焦点还给打开它的按钮，浏览器会把页面滚回那个按钮：先让按钮失去焦点
    if (Platform.OS === 'web') (document.activeElement as HTMLElement | null)?.blur?.();
    setJumpOpen(true);
  };
  const tryJump = () => {
    const month = target.current;
    const y = month ? monthY.current.get(month) : undefined;
    if (!sheetGone.current || y == null) return;
    target.current = null;
    // 顶部毛玻璃标题栏会挡住一截；距离可能很远，直接跳过去
    scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + gridY.current + y - insets.top - 56), animated: false });
  };
  const pickMonth = (month: string) => {
    setJumpOpen(false);
    setPicked(month);
    sheetGone.current = false;
    target.current = month;
    const needed = (months.data ?? []).filter((m) => m.month >= month).reduce((n, m) => n + m.count, 0);
    if (needed > limit) setLimit(Math.ceil(needed / PAGE) * PAGE);
  };
  const changeFilter = (f: Filter) => {
    setFilter(f);
    setPicked(null);
    target.current = null;
    monthY.current.clear();
  };

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
        scrollRef={scrollRef}
        title={sel.selecting ? (sel.selected.size ? `已选 ${sel.selected.size} 项` : '选择照片') : '相册'}
        right={right}
        onRefresh={async () => {
          await Promise.all([invalidate('gallery'), invalidate('albums')]);
        }}>
        <UploadBanner />
        {!sel.selecting && <PeerBanner items={items} />}
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

        <View style={{ marginTop: sel.selecting ? 0 : 14 }} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          {tab === 'albums' && !sel.selecting ? (
            <Albums />
          ) : (
            <>
              {!sel.selecting && (
                <Row gap={8} style={{ marginBottom: 14, marginLeft: -16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingLeft: 16, paddingRight: 4 }}>
                    {FILTERS.map((f) => (
                      <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => changeFilter(f.key)} />
                    ))}
                  </ScrollView>
                  {(months.data?.length ?? 0) > 1 && <IconButton icon={CalendarDays} onPress={openJump} size={40} label="选择月份" />}
                </Row>
              )}
              <QueryFallback q={list} kind="grid" count={6} />
              {list.data && items.length === 0 ? (
                filter === 'all' ? (
                  <Empty emoji="🖼️" title="还没有照片" action={<Button title="上传照片和视频" icon={ImagePlus} onPress={upload} />} />
                ) : (
                  <Empty emoji={FILTERS.find((f) => f.key === filter)!.emoji} title={FILTERS.find((f) => f.key === filter)!.empty} />
                )
              ) : (
                <View onLayout={(e) => (gridY.current = e.nativeEvent.layout.y)}>
                  <GalleryGrid
                    // 换筛选时重新排版，每个月的位置重新量
                    key={filter}
                    items={items}
                    selecting={sel.selecting}
                    selected={sel.selected}
                    onToggle={sel.toggle}
                    onStartSelect={sel.start}
                    onOpen={(i) => openViewer(items.map(galleryEntry), i, { mode: 'gallery' })}
                    onPressMonth={(months.data?.length ?? 0) > 1 ? openJump : undefined}
                    peer={presence.grid}
                    onMonthLayout={(month, y) => {
                      monthY.current.set(month, y);
                      if (month === target.current) tryJump();
                    }}
                  />
                </View>
              )}
              {items.length >= limit && <Button title="加载更多" variant="ghost" onPress={() => setLimit((l) => l + PAGE)} style={{ marginTop: 12 }} />}
              {sel.selecting && <View style={{ height: 90 }} />}
            </>
          )}
        </View>
      </Screen>
      {sel.selecting && <SelectionBar count={sel.selected.size} actions={sel.actions} aboveTabs />}
      <MonthJump
        visible={jumpOpen}
        onClose={() => setJumpOpen(false)}
        onClosed={() => {
          sheetGone.current = true;
          tryJump();
        }}
        months={months.data ?? []} current={picked} onPick={pickMonth} />
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
