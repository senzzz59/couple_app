import { LinearGradient } from 'expo-linear-gradient';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

export type VideoHandle = { play: () => void; pause: () => void; restart: () => void };

export type VideoProps = {
  uri: string;
  poster?: string;
  style?: StyleProp<ViewStyle>;
  /** 显示自己的播放控件（不用浏览器自带的） */
  controls?: boolean;
  /** 控件条是否露出来：看照片时跟着上下按钮一起显示 / 隐藏 */
  controlsVisible?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** contain：看全；cover：铺满裁切 */
  fit?: 'contain' | 'cover';
  onEnded?: () => void;
  onPlaying?: () => void;
};

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** 网页版直接用 <video>：iPhone 上 playsInline 才能在页面里播放，不会强制全屏；控件是自己画的 */
export const Video = forwardRef<VideoHandle, VideoProps>(function Video(
  { uri, poster, style, controls = true, controlsVisible = true, autoPlay, muted = false, loop, fit = 'contain', onEnded, onPlaying },
  ref
) {
  const el = useRef<HTMLVideoElement>(null);
  const bar = useRef<View>(null);
  const [paused, setPaused] = useState(!autoPlay);
  const [isMuted, setMuted] = useState(muted);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waiting, setWaiting] = useState(!!autoPlay);
  const [scrub, setScrub] = useState<number | null>(null);

  const play = () => {
    const v = el.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    v.play().catch(() => {
      // 浏览器不让带声音自动播放：先静音播放，右下角可以打开声音
      if (v.muted) return setPaused(true);
      v.muted = true;
      setMuted(true);
      v.play().catch(() => setPaused(true));
    });
  };

  useImperativeHandle(ref, () => ({
    play,
    pause: () => el.current?.pause(),
    restart: () => {
      if (!el.current) return;
      el.current.currentTime = 0;
      play();
    },
  }));

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    v.muted = muted;
    if (autoPlay) play();
    // 离开页面（翻到别的照片）时停止播放
    return () => v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 播放时每帧刷新进度，进度条走得顺滑
  useEffect(() => {
    if (paused || !controls) return;
    let raf = 0;
    const tick = () => {
      if (el.current) setTime(el.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, controls]);

  // 拖进度条时别让外面的左右翻页抢走手势
  useEffect(() => {
    const node = bar.current as unknown as HTMLElement | null;
    if (node?.style) node.style.touchAction = 'none';
  }, [controls]);

  const seekTo = (e: GestureResponderEvent) => {
    const node = bar.current as unknown as HTMLElement | null;
    const v = el.current;
    if (!node?.getBoundingClientRect || !v || !duration) return;
    const r = node.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.nativeEvent.pageX - r.left) / r.width));
    setScrub(f);
    setTime(f * duration);
    v.currentTime = f * duration;
  };

  const toggleMute = () => {
    const v = el.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) play();
  };

  const progress = scrub ?? (duration ? time / duration : 0);
  const showBar = controls && controlsVisible;

  return (
    <View style={[styles.wrap, style]}>
      <video
        ref={el}
        src={uri}
        poster={poster}
        loop={loop}
        playsInline
        preload={controls ? 'auto' : 'metadata'}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onPlaying={() => {
          setWaiting(false);
          onPlaying?.();
        }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPaused(true);
          onEnded?.();
        }}
        style={{ width: '100%', height: '100%', objectFit: fit, background: 'transparent', display: 'block' }}
      />

      {controls && waiting && !paused && (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {/* 只在暂停时露出中间的播放按钮 */}
      {controls && paused && scrub === null && (
        <View pointerEvents="box-none" style={styles.center}>
          <Pressable onPress={play} style={styles.bigPlay} accessibilityLabel="播放">
            <Play size={30} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
          </Pressable>
        </View>
      )}

      {showBar && (
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.barWrap} pointerEvents="box-none">
          <Pressable onPress={paused ? play : () => el.current?.pause()} hitSlop={8} style={styles.icon} accessibilityLabel={paused ? '播放' : '暂停'}>
            {paused ? <Play size={18} color="#fff" fill="#fff" /> : <Pause size={18} color="#fff" fill="#fff" />}
          </Pressable>
          <Text style={styles.time}>{fmt(scrub !== null ? scrub * duration : time)}</Text>
          <View
            ref={bar}
            style={styles.track}
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={seekTo}
            onResponderMove={seekTo}
            onResponderRelease={() => setScrub(null)}
            onResponderTerminate={() => setScrub(null)}
            // 网页上点击会冒泡到外层（看照片时点一下是显示 / 隐藏按钮），拖进度条时不要触发
            {...({ onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() } as object)}>
            <View style={styles.rail}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={[styles.knob, scrub !== null && styles.knobActive, { left: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.time}>{fmt(duration)}</Text>
          <Pressable onPress={toggleMute} hitSlop={8} style={styles.icon} accessibilityLabel={isMuted ? '打开声音' : '静音'}>
            {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
          </Pressable>
        </LinearGradient>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
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
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 24,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  time: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'center' },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  rail: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#fff' },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, backgroundColor: '#fff' },
  knobActive: { width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
});
