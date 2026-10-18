import { Image } from 'expo-image';
import { Check, ChevronDown, ChevronRight, Heart } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { galleryToMedia, mediaUrl } from '@/lib/media';
import type { GalleryItem, User } from '@/lib/types';
import { colors } from '@/theme';

import { MediaThumb } from './Media';
import { Avatar, PressScale, Row, Txt } from './ui';

const GAP = 3;

export function useGridColumns() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 720) - 32;
  const cols = w > 600 ? 5 : w > 420 ? 4 : 3;
  return { cols, cell: Math.floor((w - GAP * (cols - 1)) / cols) };
}

/** 按「年月」分组，同一个月放在一起；key 是 YYYY-MM（和 /api/gallery/months 一致） */
function groupByMonth(items: GalleryItem[]) {
  const groups: { key: string; label: string; items: GalleryItem[] }[] = [];
  const now = new Date();
  for (const it of items) {
    const d = new Date(it.takenAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      const label = d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月`;
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

/**
 * 相册网格：按月分组。
 * selecting 为 true 时点按是选择；否则点按打开，长按进入选择并选中这一项。
 * 点月份标题收起 / 展开这个月（collapsed 里是收起的 YYYY-MM）；counts：每个月的总数（没加载完也准）；
 * onMonthLayout：每个月在网格里的位置（跳到某个月用）。
 */
export function GalleryGrid({
  items,
  selecting,
  selected,
  onToggle,
  onOpen,
  onStartSelect,
  grouped = true,
  collapsed,
  onToggleMonth,
  counts,
  onMonthLayout,
  peer,
}: {
  items: GalleryItem[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (index: number) => void;
  onStartSelect: (id: string) => void;
  grouped?: boolean;
  collapsed?: Set<string>;
  onToggleMonth?: (month: string) => void;
  counts?: Map<string, number>;
  onMonthLayout?: (month: string, y: number) => void;
  /** 另一半正在看的那张：描边 + 头像 */
  peer?: { itemId: string | null; user: User | null } | null;
}) {
  const { cell } = useGridColumns();
  const groups = useMemo(() => (grouped ? groupByMonth(items) : [{ key: 'all', label: '', items }]), [items, grouped]);
  const indexOf = useMemo(() => new Map(items.map((x, i) => [x.id, i])), [items]);

  return (
    <View style={{ gap: 18 }}>
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 8 }} onLayout={onMonthLayout && ((e) => onMonthLayout(g.key, e.nativeEvent.layout.y))}>
          {!!g.label && (
            <MonthHeader label={g.label} count={counts?.get(g.key) ?? g.items.length} folded={!!collapsed?.has(g.key)} items={g.items} onToggle={onToggleMonth && (() => onToggleMonth(g.key))} />
          )}
          {!collapsed?.has(g.key) && (
          <View style={styles.grid}>
            {g.items.map((it) => {
              const on = selected.has(it.id);
              return (
                <Pressable
                  key={it.id}
                  accessibilityLabel={it.kind === 'video' ? '视频' : it.kind === 'live' ? 'Live 图' : '照片'}
                  // 选择模式下是复选框，平时是可以点开的图片
                  accessibilityRole={selecting ? 'checkbox' : 'imagebutton'}
                  accessibilityState={selecting ? { checked: on } : undefined}
                  onPress={() => (selecting ? (haptic.tick(), onToggle(it.id)) : onOpen(indexOf.get(it.id) ?? 0))}
                  onLongPress={() => {
                    haptic.medium();
                    if (selecting) onToggle(it.id);
                    else onStartSelect(it.id);
                  }}
                  delayLongPress={320}
                  style={({ pressed }) => [{ width: cell, height: cell }, pressed && !selecting && { opacity: 0.85 }]}>
                  <MediaThumb item={galleryToMedia(it)} size={cell} radius={6} style={on && { transform: [{ scale: 0.9 }], borderRadius: 10 }} />
                  {peer?.itemId === it.id && !selecting && <PeerMark user={peer.user} />}
                  {it.favorite && !selecting && (
                    <View style={styles.fav} pointerEvents="none">
                      <Heart size={13} color="#fff" fill="#fff" />
                    </View>
                  )}
                  {selecting && (
                    <View pointerEvents="none" style={[styles.check, on && styles.checkOn]}>
                      {on && (
                        <Animated.View entering={ZoomIn.springify().damping(12)}>
                          <Check size={15} color="#fff" strokeWidth={3.5} />
                        </Animated.View>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** 月份标题：点一下收起 / 展开；收起时是一行小卡片，露出几张缩略图 */
function MonthHeader({ label, count, folded, items, onToggle }: { label: string; count: number; folded: boolean; items: GalleryItem[]; onToggle?: () => void }) {
  if (!onToggle)
    return (
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Txt v="heading" style={{ fontSize: 17 }}>
          {label}
        </Txt>
        <Txt v="secondary">{count}</Txt>
      </Row>
    );
  if (folded)
    return (
      <PressScale haptics={false} onPress={onToggle} accessibilityLabel={`${label}，已收起，点一下展开`} accessibilityState={{ expanded: false }} style={styles.folded}>
        <View style={{ flexDirection: 'row' }}>
          {items.slice(0, 3).map((it, i) => (
            <Image key={it.id} source={mediaUrl(it.image, 'thumb')} style={[styles.foldThumb, i > 0 && { marginLeft: -10 }]} contentFit="cover" />
          ))}
        </View>
        <Txt v="heading" style={{ fontSize: 17 }}>
          {label}
        </Txt>
        <Txt v="secondary" style={{ flex: 1 }}>
          {count} 项 · 已收起
        </Txt>
        <ChevronRight size={18} color={colors.muted} />
      </PressScale>
    );
  return (
    <PressScale haptics={false} hitSlop={6} onPress={onToggle} accessibilityLabel={`${label}，点一下收起`} accessibilityState={{ expanded: true }} style={styles.monthBtn}>
      <Txt v="heading" style={{ fontSize: 17 }}>
        {label}
      </Txt>
      <Txt v="secondary" style={{ flex: 1 }}>
        {count} 项
      </Txt>
      <ChevronDown size={18} color={colors.muted} />
    </PressScale>
  );
}

/** TA 正在看这张：一圈慢慢呼吸的粉色描边，左上角 TA 的头像 */
function PeerMark({ user }: { user: User | null }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(0.35, { duration: 900 }), -1, true));
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.peerRing, ring]} />
      <View style={styles.peerAvatar}>
        <Avatar user={user} size={22} ring={colors.white} />
      </View>
    </View>
  );
}

/** 顶部上传条：实现在 UploadCenter（点开能看每一项的进度） */
export { UploadBanner } from './UploadCenter';

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  monthBtn: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, paddingVertical: 2 },
  folded: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  foldThumb: { width: 30, height: 30, borderRadius: 7, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surfaceAlt },
  fav: { position: 'absolute', left: 6, bottom: 6 },
  peerRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, borderWidth: 3, borderColor: colors.accent },
  peerAvatar: { position: 'absolute', left: 4, top: 4 },
  check: { position: 'absolute', right: 6, top: 6, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
});
