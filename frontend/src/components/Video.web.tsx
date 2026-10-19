import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FastForward, Maximize, Minimize, Pause, Play, RotateCw, Volume2, VolumeX } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

export type VideoHandle = { play: () => void; pause: () => void; restart: () => void; /** 停在第几秒（选帧用） */ seek: (t: number) => void };

export type VideoProps = {
  uri: string;
  poster?: string;
  /**
   * 已经加载好的小图（比如缩略图）：画面真正播出来之前一直盖着 poster（先显示这张小图），
   * 播出来再淡出，翻到视频时不会先黑一下
   */
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  /** 显示自己的播放控件（不用浏览器自带的） */
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

type Orientation = { lock?: (o: string) => Promise<void>; unlock?: () => void; type?: string };
const orientation = () => (globalThis.screen?.orientation as Orientation | undefined) ?? undefined;
const lockTo = async (o: 'landscape' | 'portrait') => {
  try {
    await orientation()?.lock?.(o);
  } catch {
    // 不支持锁方向（iPhone、电脑）：就按手机当前方向
  }
};
const noop = (e: { stopPropagation: () => void }) => e.stopPropagation();
/** RN 的类型里没有这些网页事件，用这个塞给 View */
const web = (p: Record<string, unknown>) => p as object;

/** 网页版直接用 <video>：iPhone 上 playsInline 才能在页面里播放，不会强制全屏；控件是自己画的 */
export const Video = forwardRef<VideoHandle, VideoProps>(function Video(
  { uri, poster, placeholder, style, controls = true, controlsVisible = true, onTap, autoPlay, muted = false, loop, fit = 'contain', onEnded, onPlaying },
  ref
) {
  const el = useRef<HTMLVideoElement>(null);
  const wrap = useRef<View>(null);
  const bar = useRef<View>(null);
  const [paused, setPaused] = useState(!autoPlay);
  const [isMuted, setMuted] = useState(muted);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waiting, setWaiting] = useState(!!autoPlay);
  const [scrub, setScrub] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [rateMenu, setRateMenu] = useState(false);
  const [fast, setFast] = useState(false);
  const [fs, setFs] = useState(false);
  const [fsBar, setFsBar] = useState(true);
  const [landscape, setLandscape] = useState(false);
  // 第一帧播出来了（或拖过进度条）：可以拿掉盖着的封面
  const [shown, setShown] = useState(false);

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
    seek: (t: number) => {
      const v = el.current;
      if (!v) return;
      v.pause();
      // 原生 fastSeek 更快但不精确；选帧要准，直接设 currentTime
      v.currentTime = Math.max(0, Math.min(t, Number.isFinite(v.duration) ? v.duration : t));
    },
  }));

  useEffect(() => {
    const v = el.current;
    const node = wrap.current as unknown as Element | null;
    if (!v) return;
    v.muted = muted;
    if (autoPlay) play();
    // 离开页面（翻到别的照片）时停止播放、退出全屏
    return () => {
      v.pause();
      if (node && document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
    };
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
  });

  // 全屏：进出都同步状态；退出时把方向还给系统
  useEffect(() => {
    if (!controls) return;
    const onChange = () => {
      const on = !!document.fullscreenElement && document.fullscreenElement === (wrap.current as unknown as Element);
      setFs(on);
      setFsBar(true);
      if (!on) orientation()?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [controls]);

  // 全屏播放时控件 3 秒后自动藏起来
  useEffect(() => {
    if (!fs || !fsBar || paused || rateMenu || scrub !== null) return;
    const t = setTimeout(() => setFsBar(false), 3000);
    return () => clearTimeout(t);
  }, [fs, fsBar, paused, rateMenu, scrub]);

  const enterFs = async () => {
    const node = wrap.current as unknown as HTMLElement & { webkitRequestFullscreen?: () => void };
    const v = el.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!node || !v) return;
    if (node.requestFullscreen) {
      try {
        await node.requestFullscreen({ navigationUI: 'hide' });
        const wide = v.videoWidth > v.videoHeight;
        setLandscape(wide);
        await lockTo(wide ? 'landscape' : 'portrait');
        return;
      } catch {
        // 落到下面 iPhone 的办法
      }
    }
    if (node.webkitRequestFullscreen) return node.webkitRequestFullscreen();
    // iPhone 不支持网页元素全屏：交给系统播放器全屏（可以横过来看）
    v.webkitEnterFullscreen?.();
  };
  const exitFs = () => void document.exitFullscreen?.().catch(() => {});
  const rotate = () => {
    const next = !landscape;
    setLandscape(next);
    void lockTo(next ? 'landscape' : 'portrait');
  };

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

  const pickRate = (r: number) => {
    if (el.current) el.current.playbackRate = r;
    setRate(r);
    setRateMenu(false);
  };

  // 长按画面（左边右边都行）：按住期间 2 倍速，松手恢复
  const startFast = () => {
    const v = el.current;
    if (!v) return;
    v.playbackRate = Math.max(FAST, rate);
    setFast(true);
    setRateMenu(false);
    if (v.paused) play();
  };
  const stopFast = () => {
    if (!fast) return;
    if (el.current) el.current.playbackRate = rate;
    setFast(false);
  };

  const tap = () => {
    if (rateMenu) return setRateMenu(false);
    if (fs) setFsBar((x) => !x);
    else onTap?.();
  };

  const progress = scrub ?? (duration ? time / duration : 0);
  const showBar = controls && (fs ? fsBar : controlsVisible);

  return (
    <View ref={wrap} style={[styles.wrap, style, fs && styles.fs]} {...web({ onContextMenu: (e: Event) => e.preventDefault() })}>
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
          setShown(true);
          onPlaying?.();
        }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={() => setShown(true)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPaused(true);
          onEnded?.();
        }}
        style={{ width: '100%', height: '100%', objectFit: fit, background: 'transparent', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }}
      />

      {!!placeholder && !shown && (
        <Animated.View pointerEvents="none" exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
          <Image source={poster ?? placeholder} placeholder={placeholder} style={StyleSheet.absoluteFill} contentFit={fit} />
        </Animated.View>
      )}

      {controls && (
        <>
          {/* 点一下：显示 / 隐藏按钮；长按：倍速快进 */}
          <Pressable style={StyleSheet.absoluteFill} onPress={tap} onLongPress={startFast} onPressOut={stopFast} delayLongPress={350} accessibilityLabel="视频画面，长按快进" />

          {waiting && !paused && (
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
          {paused && scrub === null && (
            <View pointerEvents="box-none" style={styles.center}>
              <Pressable onPress={play} style={styles.bigPlay} accessibilityLabel="播放">
                <Play size={30} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
          )}

          {showBar && rateMenu && (
            <View style={[styles.rateMenu, fs && styles.rateMenuFs]}>
              {RATES.map((r) => (
                <Pressable key={r} onPress={() => pickRate(r)} style={[styles.rateItem, r === rate && styles.rateItemOn]} accessibilityLabel={`${r} 倍速`}>
                  <Text style={[styles.rateText, r === rate && styles.rateTextOn]}>{r}x</Text>
                </Pressable>
              ))}
            </View>
          )}

          {showBar && fs && (
            <View style={styles.fsTop}>
              <Pressable onPress={rotate} hitSlop={8} style={styles.fsBtn} accessibilityLabel="旋转屏幕">
                <RotateCw size={18} color="#fff" />
              </Pressable>
            </View>
          )}

          {showBar && (
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={[styles.barWrap, fs && styles.barWrapFs]} pointerEvents="box-none">
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
                {...web({ onClick: noop })}>
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
              <Pressable onPress={fs ? exitFs : enterFs} hitSlop={6} style={styles.icon} accessibilityLabel={fs ? '退出全屏' : '全屏'}>
                {fs ? <Minimize size={18} color="#fff" /> : <Maximize size={18} color="#fff" />}
              </Pressable>
            </LinearGradient>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fs: { backgroundColor: '#000' },
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
  // 全屏横过来时避开刘海和底部横条
  barWrapFs: { paddingHorizontal: 28, paddingBottom: 16, paddingTop: 40 },
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
  rateMenuFs: { right: 28, bottom: 64 },
  rateItem: { height: 30, minWidth: 40, paddingHorizontal: 6, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rateItemOn: { backgroundColor: '#fff' },
  rateText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rateTextOn: { color: '#000' },
  fsTop: { position: 'absolute', top: 16, right: 28 },
  fsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
