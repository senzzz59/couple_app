import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FastForward, Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

export type VideoHandle = { play: () => void; pause: () => void; restart: () => void; /** 停在第几秒（选帧用） */ seek: (t: number) => void };

export type VideoProps = {
  uri: string;
  poster?: string;
  /** 已经加载好的小图（比如缩略图）：画面真正播出来之前一直盖着，播出来再淡出 */
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  /** 显示自己的播放控件 */
  controls?: boolean;
  /** 控件条是否露出来：看照片时跟着上下按钮一起显示 / 隐藏 */
  controlsVisible?: boolean;
  /** 点一下画面（不是控件）：看照片时用来显示 / 隐藏上下按钮 */
  onTap?: () => void;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** contain：看全；cover：铺满裁切 */
  fit?: 'contain' | 'cover';
  onEnded?: () => void;
  onPlaying?: () => void;
};

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** 长按时的倍速 */
const FAST = 2;

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** App 里用 expo-video 直接播放，控件和网页版（Video.web.tsx）一样是自己画的；全屏交给系统播放器 */
export const Video = forwardRef<VideoHandle, VideoProps>(function Video(
  { uri, poster, placeholder, style, controls = true, controlsVisible = true, onTap, autoPlay, muted = false, loop, fit = 'contain', onEnded, onPlaying },
  ref
) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = muted;
    p.loop = !!loop;
    p.timeUpdateEventInterval = controls ? 0.25 : 0;
    if (autoPlay) p.play();
  });
  const view = useRef<VideoView>(null);
  const bar = useRef<View>(null);
  const barX = useRef({ x: 0, w: 0 });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { muted: isMuted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [rateMenu, setRateMenu] = useState(false);
  const [fast, setFast] = useState(false);
  const [fs, setFs] = useState(false);
  // 第一帧播出来了：可以拿掉盖着的封面
  const [shown, setShown] = useState(false);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setTime(currentTime);
    if (player.duration) setDuration(player.duration);
  });
  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (s === 'readyToPlay') setDuration(player.duration);
  });
  useEventListener(player, 'playingChange', ({ isPlaying: on }) => {
    if (on) onPlaying?.();
  });
  useEventListener(player, 'playToEnd', () => {
    if (!loop) setTime(player.duration);
    onEnded?.();
  });

  const play = () => {
    if (player.duration && player.currentTime >= player.duration - 0.05) player.currentTime = 0;
    player.play();
  };

  useImperativeHandle(ref, () => ({
    play,
    pause: () => player.pause(),
    restart: () => {
      player.currentTime = 0;
      player.play();
    },
    seek: (t: number) => {
      player.pause();
      // 选帧要准
      player.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
      player.currentTime = Math.max(0, player.duration ? Math.min(t, player.duration) : t);
      setShown(true);
    },
  }));

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  const measureBar = () => bar.current?.measureInWindow((x, _y, w) => (barX.current = { x, w }));
  const seekTo = (e: GestureResponderEvent) => {
    const { x, w } = barX.current;
    if (!w || !duration) return;
    const f = Math.max(0, Math.min(1, (e.nativeEvent.pageX - x) / w));
    setScrub(f);
    setTime(f * duration);
    player.currentTime = f * duration;
  };

  const toggleMute = () => {
    player.muted = !player.muted;
    if (!player.playing) play();
  };

  const pickRate = (r: number) => {
    player.playbackRate = r;
    setRate(r);
    setRateMenu(false);
  };

  // 长按画面：按住期间 2 倍速，松手恢复
  const startFast = () => {
    player.playbackRate = Math.max(FAST, rate);
    setFast(true);
    setRateMenu(false);
    if (!player.playing) play();
  };
  const stopFast = () => {
    if (!fast) return;
    player.playbackRate = rate;
    setFast(false);
  };

  const tap = () => {
    if (rateMenu) return setRateMenu(false);
    onTap?.();
  };

  const paused = !isPlaying;
  const waiting = status === 'loading' && !!autoPlay;
  const progress = scrub ?? (duration ? time / duration : 0);
  const showBar = controls && controlsVisible;

  return (
    <View style={[styles.wrap, style]}>
      <VideoView
        ref={view}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        // 平时用自己的控件；全屏时交给系统播放器的控件（可以横过来看）
        nativeControls={fs}
        fullscreenOptions={{ enable: controls }}
        allowsPictureInPicture={false}
        // 叠在照片 / 列表里，用 TextureView 才不会盖住上面的东西
        surfaceType="textureView"
        onFirstFrameRender={() => setShown(true)}
        onFullscreenEnter={() => setFs(true)}
        onFullscreenExit={() => setFs(false)}
      />

      {(!!placeholder || (!!poster && !autoPlay)) && !shown && (
        <Animated.View pointerEvents="none" exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
          <Image source={poster ?? placeholder} placeholder={placeholder} style={StyleSheet.absoluteFill} contentFit={fit} />
        </Animated.View>
      )}

      {controls && (
        <>
          {/* 点一下：显示 / 隐藏按钮；长按：倍速快进 */}
          <Pressable style={StyleSheet.absoluteFill} onPress={tap} onLongPress={startFast} onPressOut={stopFast} delayLongPress={350} accessibilityLabel="视频画面，长按快进" />

          {waiting && !shown && (
            <View pointerEvents="none" style={styles.center}>
              <ActivityIndicator color="#fff" />
            </View>
          )}

          {fast && (
            <View pointerEvents="none" style={styles.fastWrap}>
              <View style={styles.fastPill}>
                <FastForward size={14} color="#fff" fill="#fff" />
                <Text style={styles.fastText}>{Math.max(FAST, rate)} 倍速快进中</Text>
              </View>
            </View>
          )}

          {/* 只在暂停时露出中间的播放按钮 */}
          {paused && !waiting && scrub === null && (
            <View pointerEvents="box-none" style={styles.center}>
              <Pressable onPress={play} style={styles.bigPlay} accessibilityLabel="播放">
                <Play size={30} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
          )}

          {showBar && rateMenu && (
            <View style={styles.rateMenu}>
              {RATES.map((r) => (
                <Pressable key={r} onPress={() => pickRate(r)} style={[styles.rateItem, r === rate && styles.rateItemOn]} accessibilityLabel={`${r} 倍速`}>
                  <Text style={[styles.rateText, r === rate && styles.rateTextOn]}>{r}x</Text>
                </Pressable>
              ))}
            </View>
          )}

          {showBar && (
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.barWrap} pointerEvents="box-none">
              <Pressable onPress={paused ? play : () => player.pause()} hitSlop={8} style={styles.icon} accessibilityLabel={paused ? '播放' : '暂停'}>
                {paused ? <Play size={18} color="#fff" fill="#fff" /> : <Pause size={18} color="#fff" fill="#fff" />}
              </Pressable>
              <Text style={styles.time}>{fmt(scrub !== null ? scrub * duration : time)}</Text>
              <View
                ref={bar}
                onLayout={measureBar}
                style={styles.track}
                onStartShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(e) => {
                  measureBar();
                  seekTo(e);
                }}
                onResponderMove={seekTo}
                onResponderRelease={() => setScrub(null)}
                onResponderTerminate={() => setScrub(null)}>
                <View style={styles.rail}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={[styles.knob, scrub !== null && styles.knobActive, { left: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.time}>{fmt(duration)}</Text>
              <Pressable onPress={() => setRateMenu((x) => !x)} hitSlop={6} style={styles.rateBtn} accessibilityLabel="倍速">
                <Text style={[styles.rateBtnText, rate !== 1 && { color: '#ffd36b' }]}>{rate === 1 ? '倍速' : `${rate}x`}</Text>
              </Pressable>
              <Pressable onPress={toggleMute} hitSlop={6} style={styles.icon} accessibilityLabel={isMuted ? '打开声音' : '静音'}>
                {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
              </Pressable>
              <Pressable onPress={() => void view.current?.enterFullscreen().catch(() => {})} hitSlop={6} style={styles.icon} accessibilityLabel="全屏">
                <Maximize size={18} color="#fff" />
              </Pressable>
            </LinearGradient>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bigPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fastWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  fastPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)' },
  fastText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 24,
    paddingBottom: 6,
    paddingHorizontal: 6,
  },
  icon: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  time: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'center' },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  rail: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#fff' },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: '#fff' },
  knobActive: { width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  rateBtn: { height: 32, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  rateBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rateMenu: {
    position: 'absolute',
    right: 8,
    bottom: 46,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  rateItem: { height: 30, minWidth: 40, paddingHorizontal: 6, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rateItemOn: { backgroundColor: '#fff' },
  rateText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rateTextOn: { color: '#000' },
});
