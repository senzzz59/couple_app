import { Image } from 'expo-image';
import { ChevronRight, Play, RotateCw, X, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { clearFinished, removeUpload, retryFailed, retryUpload, useUploadItems, useUploadJob, type UploadItem } from '@/lib/galleryUpload';
import { fmtSize } from '@/lib/media';
import { colors, radius, shadow } from '@/theme';

import { Sheet } from './Sheet';
import { PressScale, Row, Txt } from './ui';

const LABEL: Record<UploadItem['status'], string> = {
  queued: '排队中',
  uploading: '上传中',
  processing: '处理中',
  done: '已完成',
  instant: '快速上传',
  failed: '失败',
};

/** 相册页顶部的上传条：点开看每一项的进度 */
export function UploadBanner() {
  const job = useUploadJob();
  const [open, setOpen] = useState(false);
  if (!job) return null;
  const pct = Math.round(job.progress * 100);
  const title =
    job.status === 'done'
      ? job.failed
        ? `${job.failed} 项上传失败`
        : `已上传 ${job.total} 项${job.instant ? ` · ${job.instant} 项快速上传` : ''}`
      : `正在上传 ${Math.min(job.done + 1, job.total)}/${job.total}`;
  return (
    <>
      <PressScale haptics={false} scaleTo={0.98} onPress={() => setOpen(true)} accessibilityLabel="查看上传详情">
        <Animated.View entering={FadeIn.duration(200)} style={styles.banner}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="bodyStrong" style={{ fontSize: 14, flex: 1 }}>
              {title}
            </Txt>
            <Row gap={2}>
              <Txt v="caption">{pct}%</Txt>
              <ChevronRight size={16} color={colors.muted} />
            </Row>
          </Row>
          <View style={styles.track}>
            <View style={[styles.fill, job.failed && !job.active ? { backgroundColor: colors.butterInk } : null, { width: `${pct}%` }]} />
          </View>
        </Animated.View>
      </PressScale>
      <UploadSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function UploadSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items = useUploadItems();
  const job = useUploadJob();
  const { height } = useWindowDimensions();
  const finished = items.filter((i) => i.status === 'done' || i.status === 'instant').length;
  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere={false} style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="heading">上传</Txt>
        <Txt v="secondary">{job ? `已完成 ${job.done}/${job.total}` : '暂无上传任务'}</Txt>
      </Row>
      <Row gap={14}>
        {!!job?.failed && (
          <PressScale onPress={retryFailed} style={styles.action}>
            <RotateCw size={14} color={colors.accentStrong} />
            <Txt v="caption" color={colors.accentStrong} style={{ fontWeight: '600' }}>
              全部重试
            </Txt>
          </PressScale>
        )}
        {finished > 0 && (
          <PressScale onPress={clearFinished} style={styles.action}>
            <Txt v="caption" color={colors.inkSoft} style={{ fontWeight: '600' }}>
              清除已完成
            </Txt>
          </PressScale>
        )}
      </Row>
      <ScrollView style={{ maxHeight: height * 0.55 }} contentContainerStyle={{ gap: 2, paddingBottom: 12 }}>
        {items.map((it) => (
          <UploadRow key={it.id} it={it} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function UploadRow({ it }: { it: UploadItem }) {
  const m = it.media;
  const thumb = m.uri ?? m.posterUri ?? undefined;
  const pct = Math.round(it.progress * 100);
  const moving = it.status === 'uploading' || it.status === 'processing';
  const color = it.status === 'failed' ? colors.butterInk : it.status === 'instant' ? colors.sageInk : it.status === 'done' ? colors.muted : moving ? colors.accentStrong : colors.muted;
  const status = it.status === 'uploading' ? `上传中 ${pct}%` : it.status === 'queued' && it.retryAt ? '等网络恢复' : LABEL[it.status];
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        {thumb ? <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Play size={16} color={colors.muted} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt v="body" numberOfLines={1} style={{ fontSize: 14 }}>
          {m.kind === 'live' ? `${m.name}（Live）` : m.kind === 'video' ? (m.videoName ?? m.name) : m.name}
        </Txt>
        <Row gap={6}>
          {it.status === 'instant' && <Zap size={12} color={colors.sageInk} fill={colors.sageInk} />}
          <Txt v="caption" color={color} style={{ fontWeight: '600' }}>
            {status}
          </Txt>
          {!!m.size && <Txt v="caption">{fmtSize(m.size)}</Txt>}
        </Row>
        {it.status === 'failed' && !!it.error && (
          <Txt v="caption" numberOfLines={2}>
            {it.error}
          </Txt>
        )}
        {moving && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${it.status === 'processing' ? 100 : pct}%` }, it.status === 'processing' && { opacity: 0.5 }]} />
          </View>
        )}
      </View>
      {it.status === 'failed' && (
        <PressScale onPress={() => retryUpload(it.id)} accessibilityLabel="重试" style={styles.icon}>
          <RotateCw size={16} color={colors.accentStrong} />
        </PressScale>
      )}
      {(it.status === 'failed' || it.status === 'queued') && (
        <PressScale onPress={() => removeUpload(it.id)} accessibilityLabel="取消这一项" style={styles.icon}>
          <X size={16} color={colors.muted} />
        </PressScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 8, marginBottom: 14, ...shadow },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
