import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { confirmPendingUpload, dismissPendingUpload, loadDateMode, usePendingUpload, type DateMode, type PendingUpload } from '@/lib/galleryUpload';
import { fmtSize, probeLocal, type LocalMedia } from '@/lib/media';
import { colors, radius } from '@/theme';

import { LiveBadge } from './Media';
import { Segmented } from './motion';
import { Sheet } from './Sheet';
import { Button, Row, Txt } from './ui';

/** 缩略图最多摆几格（最后一格多了就盖一个 +N） */
const SHOW = 5;

const DATE_OPTIONS: { key: DateMode; label: string }[] = [
  { key: 'taken', label: '拍摄时间' },
  { key: 'upload', label: '上传时间' },
];

/** 选好照片 / 视频后弹出来：看一眼选了什么，选日期以什么为准，再开始上传 */
export function UploadConfirmHost() {
  const pending = usePendingUpload();
  // 收起动画播放时还要显示上一批
  const [shown, setShown] = useState<PendingUpload | null>(pending);
  const [mode, setMode] = useState<DateMode>('taken');
  if (pending && pending !== shown) setShown(pending);
  // 上次选的日期方式
  useEffect(() => void loadDateMode().then(setMode), []);

  const list = shown?.list ?? [];
  const videos = list.filter((m) => m.kind === 'video').length;
  const lives = list.filter((m) => m.kind === 'live').length;
  const size = list.reduce((n, m) => n + (m.size ?? 0), 0);
  const parts = [videos && `${videos} 个视频`, lives && `${lives} 张 Live 图`].filter(Boolean).join('、');
  return (
    <Sheet visible={!!pending} onClose={dismissPendingUpload} onClosed={() => setShown(null)} style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Txt v="heading">上传 {list.length} 项</Txt>
        <Txt v="caption">{[parts && `含 ${parts}`, fmtSize(size)].filter(Boolean).join(' · ')}</Txt>
      </View>
      <Row gap={6}>
        {list.slice(0, SHOW).map((m, i) => (
          <Thumb key={m.key} m={m} more={i === SHOW - 1 ? list.length - SHOW : 0} />
        ))}
      </Row>
      <View style={{ gap: 8 }}>
        <Txt v="bodyStrong" style={{ fontSize: 14 }}>
          日期按
        </Txt>
        <Segmented options={DATE_OPTIONS} value={mode} onChange={setMode} />
        <Txt v="caption">{mode === 'taken' ? '按照片里记录的拍摄时间放进相册，读不到时用文件的时间' : '都按现在的时间放进相册，保持选择时的顺序'}</Txt>
      </View>
      <Row gap={10} style={{ marginTop: 4 }}>
        <Button title="取消" variant="secondary" onPress={dismissPendingUpload} style={{ flex: 1 }} />
        <Button title="开始上传" onPress={() => confirmPendingUpload(mode)} style={{ flex: 1 }} />
      </Row>
    </Sheet>
  );
}

function Thumb({ m, more }: { m: LocalMedia; more: number }) {
  // 网页上视频要截一帧才有缩略图：只为摆出来的这几项截
  const [uri, setUri] = useState(m.uri ?? m.posterUri ?? null);
  useEffect(() => {
    if (uri || m.kind !== 'video') return;
    let live = true;
    void probeLocal(m).then((p) => live && setUri(p.posterUri ?? null));
    return () => {
      live = false;
    };
  }, [m, uri]);
  return (
    <View style={styles.thumb}>
      {uri ? <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Play size={18} color={colors.muted} />}
      {m.kind === 'live' && !more && (
        <View style={{ position: 'absolute', left: 3, top: 3 }}>
          <LiveBadge small />
        </View>
      )}
      {more > 0 && (
        <View style={[StyleSheet.absoluteFill, styles.more]}>
          <Text style={styles.moreText}>+{more}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { flex: 1, aspectRatio: 1, maxWidth: 88, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  more: { backgroundColor: 'rgba(30,20,24,0.5)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
