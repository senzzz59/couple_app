import { useNavigationContainerRef } from 'expo-router';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { releasesSince } from '@/lib/changelog';
import { haptic } from '@/lib/haptics';
import { saveForUpdate } from '@/lib/keep';
import { closeUpdateSheet, takePendingRestore, useUpdateSheetOpen } from '@/lib/updateFlow';
import { appUpdates, appVersion, updateCandidate, useAppUpdates } from '@/lib/updates';
import { colors, fonts, radius, springs } from '@/theme';

import { ApkUpdateHost } from './ApkUpdate';
import { Blob, BlobCouple, FlatHeart, type BlobMood } from './Mascot';
import { toast } from './motion';
import { ReleaseCard } from './ReleaseNotes';
import { Sheet } from './Sheet';
import { Button, Row, Txt } from './ui';

/** 更新动画至少播放这么久，再刷新进入新版本 */
const CURTAIN_MS = 2000;

/**
 * 根布局里的更新中心：
 * - 「发现新版本」弹窗：这次更新了什么 + 立即更新
 * - 立即更新：全屏播放团子动画，同时保存当前页面和正在填的内容，然后刷新进入新版本
 * - 刷新回来：把页面层级放回去（还在原来的页面，返回也能回到上一页）
 */
export function UpdateHost({ signedIn }: { signedIn: boolean }) {
  const open = useUpdateSheetOpen();
  const nav = useNavigationContainerRef();
  const [updating, setUpdating] = useState(false);

  // 刷新回来：恢复页面层级，提示已经是新版本
  useEffect(() => {
    if (!signedIn) return;
    const restore = takePendingRestore();
    if (!restore) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const apply = () => {
      if (!nav.isReady()) {
        if (tries++ < 60) timer = setTimeout(apply, 50);
        return;
      }
      if (restore.nav) {
        try {
          nav.resetRoot(restore.nav as Parameters<typeof nav.resetRoot>[0]);
        } catch {}
      }
      if (restore.from && restore.from !== appVersion) toast(`已更新到 v${appVersion}`, '✓');
    };
    apply();
    return () => clearTimeout(timer);
  }, [signedIn, nav]);

  const start = async () => {
    haptic.success();
    closeUpdateSheet();
    setUpdating(true);
    await Promise.all([new Promise((r) => setTimeout(r, CURTAIN_MS)), saveForUpdate(nav.isReady() ? nav.getRootState() : null, appVersion).catch(() => {})]);
    if (!(await appUpdates.install())) {
      setUpdating(false);
      toast(appUpdates.getState().error ?? '更新没有完成，请重试', '⚠️');
    }
  };

  return (
    <>
      <UpdateSheet visible={open} onClose={closeUpdateSheet} onUpdate={start} />
      <ApkUpdateHost />
      {updating && <UpdateCurtain />}
    </>
  );
}

function UpdateSheet({ visible, onClose, onUpdate }: { visible: boolean; onClose: () => void; onUpdate: () => void }) {
  const state = useAppUpdates();
  const { height } = useWindowDimensions();
  // 弹窗打开时读一次新版本的信息
  const candidate = useMemo(() => (visible ? updateCandidate() : null), [visible]);
  const releases = useMemo(() => releasesSince(candidate?.notes ?? []), [candidate]);
  const next = candidate?.version;
  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere={false} style={{ gap: 16 }}>
      <View style={styles.head}>
        <BlobCouple size={128} mood="happy" />
        <Txt v="heading" style={{ fontSize: 22, lineHeight: 30 }}>
          发现新版本
        </Txt>
        <Row gap={8}>
          <View style={styles.pill}>
            <Txt v="bodyStrong" color={colors.inkSoft} style={styles.pillText}>
              v{appVersion}
            </Txt>
          </View>
          <ArrowRight size={16} color={colors.muted} />
          <View style={[styles.pill, { backgroundColor: colors.accentStrong }]}>
            <Txt v="bodyStrong" color={colors.white} style={styles.pillText}>
              {next ? `v${next}` : '新版本'}
            </Txt>
          </View>
        </Row>
      </View>
      {releases.length > 0 && (
        <ScrollView style={{ maxHeight: height * 0.4 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          {releases.map((r) => (
            <ReleaseCard key={r.id} r={r} flat />
          ))}
        </ScrollView>
      )}
      <View style={{ gap: 4 }}>
        <Button title="立即更新" icon={Sparkles} onPress={onUpdate} disabled={!state.pending} loading={state.phase === 'downloading'} />
        <Button title="稍后" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

// ---------------- 更新动画：两个团子蹦过来贴贴，爱心跳出来，进度条走满后进入新版本
function HopIn({ who, mood }: { who: 'him' | 'her'; mood: BlobMood }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(who === 'him' ? 120 : 180, withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) })));
  }, [p, who]);
  const side = who === 'him' ? -1 : 1;
  const style = useAnimatedStyle(() => {
    const hop = Math.abs(Math.sin(p.value * Math.PI * 2));
    return {
      transform: [{ translateX: side * 64 * (1 - p.value) }, { translateY: -20 * hop }, { scaleX: 1 + 0.06 * (1 - hop) * (1 - p.value) }, { scaleY: 1 - 0.05 * (1 - hop) * (1 - p.value) }],
    };
  });
  return (
    <Animated.View style={[style, who === 'her' && { marginLeft: -16 }]}>
      <Blob who={who} size={96} mood={mood} lean={side * -6} delay={900} />
    </Animated.View>
  );
}

function Floaty({ i }: { i: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(900 + i * 260, withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1)));
  }, [p, i]);
  const dx = [-46, 40, -20, 30][i % 4];
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.2 ? p.value * 5 : 1 - (p.value - 0.2) / 0.8,
    transform: [{ translateX: dx * p.value }, { translateY: -70 * p.value }, { scale: 0.5 + 0.6 * p.value }],
  }));
  return (
    <Animated.View style={[styles.floaty, style]}>
      <FlatHeart size={16} color={['#F9B4C4', '#E5627F', '#F27B96', '#FBD5BF'][i % 4]} />
    </Animated.View>
  );
}

function UpdateCurtain() {
  const insets = useSafeAreaInsets();
  const [mood, setMood] = useState<BlobMood>('normal');
  const [almost, setAlmost] = useState(false);
  const heart = useSharedValue(0);
  const bar = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setMood('happy');
      haptic.tap();
    }, 900);
    const t2 = setTimeout(() => setAlmost(true), CURTAIN_MS - 600);
    heart.set(withDelay(940, withSequence(withSpring(1, springs.bouncy), withRepeat(withSequence(withTiming(1.18, { duration: 160 }), withTiming(1, { duration: 260 })), -1))));
    bar.set(withDelay(200, withTiming(1, { duration: CURTAIN_MS - 200, easing: Easing.inOut(Easing.cubic) })));
    glow.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heart, bar, glow]);

  const heartStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, heart.value * 2), transform: [{ translateY: (1 - Math.min(heart.value, 1)) * 18 }, { scale: heart.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(bar.value * 100)}%` }));
  const glowStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.08 }], opacity: 0.7 + glow.value * 0.3 }));

  return (
    <Animated.View entering={FadeIn.duration(260)} style={[StyleSheet.absoluteFill, styles.curtain, { paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.stage}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={[styles.heart, heartStyle]}>
          <FlatHeart size={38} />
        </Animated.View>
        {[0, 1, 2, 3].map((i) => (
          <Floaty key={i} i={i} />
        ))}
        <View style={styles.pair}>
          <HopIn who="him" mood={mood} />
          <HopIn who="her" mood={mood} />
        </View>
      </View>
      <Txt style={styles.word}>{almost ? '马上就好' : '正在更新'}</Txt>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 4 },
  pill: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  pillText: { fontFamily: fonts.display, fontSize: 14 },
  curtain: { zIndex: 2000, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 22 },
  stage: { width: 240, height: 190, alignItems: 'center', justifyContent: 'flex-end' },
  glow: { position: 'absolute', bottom: -10, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.pink },
  pair: { flexDirection: 'row', alignItems: 'flex-end' },
  heart: { position: 'absolute', top: 0 },
  floaty: { position: 'absolute', top: 40 },
  word: { fontFamily: fonts.round, fontSize: 22, lineHeight: 30, color: colors.ink },
  track: { width: 180, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
