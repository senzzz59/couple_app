import { Download, PackageCheck, RotateCw } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { cancelApkDownload, closeApkUpdate, downloadApk, installApk, useApkUpdate } from '@/lib/apkUpdate';
import { releasesSince } from '@/lib/changelog';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radius } from '@/theme';

import { BlobCouple } from './Mascot';
import { ReleaseCard } from './ReleaseNotes';
import { Sheet } from './Sheet';
import { Button, Row, Txt } from './ui';

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
const rate = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB/s` : `${Math.max(0, Math.round(b / 1024))} KB/s`);

/**
 * 安卓新安装包：发现新版本 → 在 App 里下载（团子 + 进度条）→ 打开系统安装界面。
 * 下载时可以关掉弹窗继续用，下载好会自己弹回来。
 */
export function ApkUpdateHost() {
  const s = useApkUpdate();
  const { height } = useWindowDimensions();
  const releases = useMemo(() => releasesSince(s.info?.notes ?? []), [s.info]);
  const downloading = s.phase === 'downloading';
  const done = s.phase === 'downloaded';
  const total = s.total || s.info?.size || 0;
  const progress = done ? 1 : total ? Math.min(1, s.received / total) : 0;

  const bar = useSharedValue(0);
  const shine = useSharedValue(0);
  useEffect(() => {
    bar.set(withTiming(progress, { duration: 260, easing: Easing.out(Easing.quad) }));
  }, [bar, progress]);
  useEffect(() => {
    shine.set(downloading ? withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1) : 0);
  }, [shine, downloading]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const shineStyle = useAnimatedStyle(() => ({ opacity: shine.value > 0 ? 0.45 : 0, transform: [{ translateX: -60 + shine.value * 320 }] }));

  const title = done ? '新版本下载好了' : downloading ? '正在下载新版本' : s.phase === 'error' ? '下载没有完成' : '发现新版本';
  const hint = done
    ? '点「安装」覆盖安装就好，照片和聊天都在服务器上，不会丢。第一次安装时系统会让你允许「安装未知应用」，打开开关再返回就行。'
    : downloading
      ? '可以先关掉这个窗口继续用，下载好了会提醒你'
      : s.phase === 'error'
        ? s.error ?? '下载中断了，检查网络后重试'
        : '这次更新需要重新装一次 App，在这里下载完直接安装';

  return (
    <Sheet visible={s.open && !!s.info} onClose={closeApkUpdate} dragAnywhere={false} style={{ gap: 16 }}>
      <View style={styles.head}>
        <BlobCouple size={120} mood={done ? 'happy' : 'normal'} />
        <Txt v="heading" style={{ fontSize: 22, lineHeight: 30 }}>
          {title}
        </Txt>
        {!!s.info?.version && (
          <View style={styles.pill}>
            <Txt v="bodyStrong" color={colors.white} style={styles.pillText}>
              v{s.info.version} 安装包{total ? ` · ${mb(total)}` : ''}
            </Txt>
          </View>
        )}
      </View>

      {(downloading || done) && (
        <View style={styles.progress}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Txt style={styles.percent}>{Math.floor(progress * 100)}%</Txt>
            <Txt v="secondary" style={styles.numbers}>
              {done ? mb(total) : `${mb(s.received)} / ${mb(total)}${s.speed ? ` · ${rate(s.speed)}` : ''}`}
            </Txt>
          </Row>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]}>
              <Animated.View style={[styles.shine, shineStyle]} />
            </Animated.View>
          </View>
        </View>
      )}

      {!downloading && !done && releases.length > 0 && (
        <ScrollView style={{ maxHeight: height * 0.32 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {releases.map((r) => (
            <ReleaseCard key={r.id} r={r} flat />
          ))}
        </ScrollView>
      )}

      <Txt v="secondary" style={styles.hint}>
        {hint}
      </Txt>

      <View style={{ gap: 4 }}>
        {done ? (
          <Button
            title="安装"
            icon={PackageCheck}
            onPress={() => {
              haptic.success();
              void installApk();
            }}
          />
        ) : downloading ? (
          <Button title="后台下载" variant="secondary" onPress={closeApkUpdate} />
        ) : (
          <Button
            title={s.phase === 'error' ? '重新下载' : '下载并安装'}
            icon={s.phase === 'error' ? RotateCw : Download}
            onPress={() => {
              haptic.tap();
              void downloadApk();
            }}
          />
        )}
        {downloading ? (
          <Button title="取消下载" variant="ghost" onPress={cancelApkDownload} />
        ) : (
          <Button title="稍后" variant="ghost" onPress={closeApkUpdate} />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 4 },
  pill: { height: 30, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.accentStrong, justifyContent: 'center' },
  pillText: { fontFamily: fonts.display, fontSize: 14 },
  progress: { gap: 10, paddingHorizontal: 4 },
  percent: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink },
  numbers: { fontVariant: ['tabular-nums'], marginBottom: 6 },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 14, borderRadius: 7, backgroundColor: colors.accent, overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, width: 50, backgroundColor: colors.white, borderRadius: 7 },
  hint: { textAlign: 'center', lineHeight: 20 },
});
