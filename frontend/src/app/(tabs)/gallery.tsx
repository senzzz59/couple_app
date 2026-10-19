import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CircleDot, Heart, ImagePlus, Play, Plus } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { AlbumEditor } from '@/components/AlbumEditor';
import { AlbumPicker } from '@/components/AlbumPicker';
import { GalleryGrid, UploadBanner } from '@/components/GalleryGrid';
import { Segmented, toast } from '@/components/motion';
import { MonthCards, YearCards, type GalleryView, type MonthCount } from '@/components/GalleryOverview';
import { PeerBanner, useGalleryPresence } from '@/components/PeerBanner';
import { Screen } from '@/components/Screen';
import { SelectionBar } from '@/components/SelectionBar';
import { TAB_BAR_HEIGHT } from '@/components/TabBar';
import { QueryFallback } from '@/components/Skeleton';
import { Button, Chip, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { uploadToGallery } from '@/lib/galleryUpload';
import { haptic } from '@/lib/haptics';
import { useGallerySelection } from '@/lib/gallerySelection';
import { mediaUrl } from '@/lib/media';
import { invalidate, useQuery } from '@/lib/store';
import type { Album, GalleryItem, GallerySummary } from '@/lib/types';
import { useKept } from '@/lib/useKept';
import { galleryEntry, openViewer } from '@/lib/viewer';
import { colors, radius, shadow } from '@/theme';

type Filter = 'all' | 'image' | 'video' | 'favorite';
const FILTERS: { key: Filter; label: string; empty: string; emoji: string }[] = [
  { key: 'all', label: '全部', empty: '还没有照片', emoji: '🖼️' },
  { key: 'image', label: '照片', empty: '还没有照片', emoji: '🖼️' },
  { key: 'video', label: '视频', empty: '还没有视频', emoji: '🎞️' },
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

// 「照片」里也有 Live 图（kind=photo）：Live 图本来就是照片
const filterQuery = (f: Filter) => (f === 'favorite' ? '&favorite=1' : f === 'all' ? '' : f === 'image' ? '&kind=photo' : `&kind=${f}`);

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

  // ---- 年 / 月 / 全部（参考 iPhone 相册）；全部里每个月可以收起
  const insets = useSafeAreaInsets();
  const months = useQuery<MonthCount[]>(tab === 'photos' ? `/api/gallery/months?tz=${encodeURIComponent(TZ)}${filterQuery(filter)}` : null);
  const counts = useMemo(() => new Map((months.data ?? []).map((m) => [m.month, m.count])), [months.data]);
  const [view, setView] = useKept<GalleryView>('gallery:view', 'all');
  const [folded, setFolded] = useKept<string[]>('gallery:folded', []);
  const collapsed = useMemo(() => new Set(folded), [folded]);
  const toggleMonth = (month: string) => {
    haptic.tick();
    setFolded((xs) => (xs.includes(month) ? xs.filter((x) => x !== month) : [...xs, month]));
  };
  const scrollRef = useRef<Animated.ScrollView>(null);
  const bodyY = useRef(0);
  const gridY = useRef(0);
  const monthY = useRef(new Map<string, number>());
  // 要跳去的月份 / 年份：等它显示出来、量好位置再滚过去
  const target = useRef<string | null>(null);
  const yearTarget = useRef<string | null>(null);
  // 顶部毛玻璃标题栏会挡住一截；距离可能很远，直接跳过去
  const scrollToY = (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + y - insets.top - 56), animated: false });
  const tryJump = () => {
    const month = target.current;
    const y = month ? monthY.current.get(month) : undefined;
    if (y == null) return;
    target.current = null;
    scrollToY(gridY.current + y);
  };
  const switchView = (v: GalleryView) => {
    if (v === view) return;
    haptic.tick();
    target.current = null;
    yearTarget.current = null;
    setView(v);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  // 点「月」里的卡片：去「全部」，展开那个月，先把那个月之前（更新）的都加载出来，再滚过去
  const openMonth = (month: string) => {
    setFolded((xs) => xs.filter((x) => x !== month));
    monthY.current.clear();
    target.current = month;
    const needed = (months.data ?? []).filter((m) => m.month >= month).reduce((n, m) => n + m.count, 0);
    if (needed > limit) setLimit(Math.ceil(needed / PAGE) * PAGE);
    setView('all');
  };
  const openYear = (year: string) => {
    yearTarget.current = year;
    setView('months');
  };
  const changeFilter = (f: Filter) => {
    setFilter(f);
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
                </Row>
              )}
              {view !== 'all' && !sel.selecting ? (
                months.data && months.data.length === 0 ? (
                  <Empty emoji="🖼️" title={FILTERS.find((f) => f.key === filter)!.empty} />
                ) : view === 'months' ? (
                  <View onLayout={(e) => (gridY.current = e.nativeEvent.layout.y)}>
                    <MonthCards
                      months={months.data ?? []}
                      onPick={openMonth}
                      onYearLayout={(year, y) => {
                        if (year !== yearTarget.current) return;
                        yearTarget.current = null;
                        // 等外层量好位置再滚
                        setTimeout(() => scrollToY(gridY.current + y), 30);
                      }}
                    />
                  </View>
                ) : (
                  <YearCards months={months.data ?? []} onPick={openYear} />
                )
              ) : (
              <>
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
                    collapsed={collapsed}
                    onToggleMonth={toggleMonth}
                    counts={counts}
                    peer={presence.grid}
                    onMonthLayout={(month, y) => {
                      monthY.current.set(month, y);
                      if (month === target.current) tryJump();
                    }}
                  />
                </View>
              )}
              {items.length >= limit && <Button title="加载更多" variant="ghost" onPress={() => setLimit((l) => l + PAGE)} style={{ marginTop: 12 }} />}
              </>
              )}
              {!sel.selecting && <View style={{ height: 56 }} />}
              {sel.selecting && <View style={{ height: 90 }} />}
            </>
          )}
        </View>
      </Screen>
      {sel.selecting && <SelectionBar count={sel.selected.size} actions={sel.actions} aboveTabs />}
      {tab === 'photos' && !sel.selecting && (months.data?.length ?? 0) > 0 && <ViewSwitch value={view} onChange={switchView} />}
      <AlbumPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onAdded={sel.stop}
        ids={sel.ids}
      />
    </View>
  );
}

const VIEWS: { key: GalleryView; label: string }[] = [
  { key: 'years', label: '年' },
  { key: 'months', label: '月' },
  { key: 'all', label: '全部' },
];

/** 底栏上面那条「年 / 月 / 全部」 */
function ViewSwitch({ value, onChange }: { value: GalleryView; onChange: (v: GalleryView) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.switchWrap, { bottom: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + 12 }]}>
      <View style={styles.switch} accessibilityRole="tablist">
        <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, styles.switchBlur]} />
        {VIEWS.map((v) => {
          const on = v.key === value;
          return (
            <PressScale key={v.key} haptics={false} scaleTo={0.92} onPress={() => onChange(v.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.switchItem, on && styles.switchOn]}>
              <Txt v="secondary" color={on ? colors.white : colors.inkSoft} style={on && { fontWeight: '700' }}>
                {v.label}
              </Txt>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  switchWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  switch: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 22, ...shadow },
  switchBlur: { borderRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.94)' },
  switchItem: { height: 34, minWidth: 54, paddingHorizontal: 16, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  switchOn: { backgroundColor: colors.ink },
  headerBtn: { height: 38, paddingHorizontal: 14 },
  albumCover: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', ...shadow },
  newAlbum: { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, gap: 6, shadowOpacity: 0 },
  smart: { width: 120, gap: 6 },
  smartCover: { width: 120, height: 86, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.pink },
  smartIcon: { position: 'absolute', left: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(30,20,24,0.4)', alignItems: 'center', justifyContent: 'center' },
});
