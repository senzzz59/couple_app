import { Check, Heart } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { galleryToMedia } from '@/lib/media';
import type { GalleryItem } from '@/lib/types';
import { useUploadJob } from '@/lib/galleryUpload';
import { colors, radius, shadow } from '@/theme';

import { MediaThumb } from './Media';
import { Row, Txt } from './ui';

const GAP = 3;

export function useGridColumns() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 720) - 32;
  const cols = w > 600 ? 5 : w > 420 ? 4 : 3;
  return { cols, cell: Math.floor((w - GAP * (cols - 1)) / cols) };
}

/** 按「年月」分组，同一个月放在一起 */
function groupByMonth(items: GalleryItem[]) {
  const groups: { key: string; label: string; items: GalleryItem[] }[] = [];
  const now = new Date();
  for (const it of items) {
    const d = new Date(it.takenAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
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
 */
export function GalleryGrid({
  items,
  selecting,
  selected,
  onToggle,
  onOpen,
  onStartSelect,
  grouped = true,
}: {
  items: GalleryItem[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (index: number) => void;
  onStartSelect: (id: string) => void;
  grouped?: boolean;
}) {
  const { cell } = useGridColumns();
  const groups = useMemo(() => (grouped ? groupByMonth(items) : [{ key: 'all', label: '', items }]), [items, grouped]);
  const indexOf = useMemo(() => new Map(items.map((x, i) => [x.id, i])), [items]);

  return (
    <View style={{ gap: 18 }}>
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 8 }}>
          {!!g.label && (
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <Txt v="heading" style={{ fontSize: 17 }}>
                {g.label}
              </Txt>
              <Txt v="secondary">{g.items.length}</Txt>
            </Row>
          )}
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
        </View>
      ))}
    </View>
  );
}

/** 顶部上传进度条（后台上传时在相册页显示） */
export function UploadBanner() {
  const job = useUploadJob();
  if (!job) return null;
  const pct = Math.round(job.progress * 100);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.banner}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="bodyStrong" style={{ fontSize: 14 }}>
          {job.status === 'done' ? (job.failed ? `${job.failed} 项上传失败` : `已上传 ${job.total} 项`) : `正在上传 ${Math.min(job.done + 1, job.total)}/${job.total}`}
        </Txt>
        <Txt v="caption">{pct}%</Txt>
      </Row>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  fav: { position: 'absolute', left: 6, bottom: 6 },
  check: { position: 'absolute', right: 6, top: 6, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  banner: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 8, marginBottom: 14, ...shadow },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
