import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export type VideoHandle = { play: () => void; pause: () => void; restart: () => void };

export type VideoProps = {
  uri: string;
  poster?: string;
  style?: StyleProp<ViewStyle>;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** contain：看全；cover：铺满裁切 */
  fit?: 'contain' | 'cover';
  onEnded?: () => void;
  onPlaying?: () => void;
};

/** 网页版直接用 <video>：iPhone 上 playsInline 才能在页面里播放，不会强制全屏 */
export const Video = forwardRef<VideoHandle, VideoProps>(function Video({ uri, poster, style, controls = true, autoPlay, muted, loop, fit = 'contain', onEnded, onPlaying }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => ({
    play: () => void el.current?.play().catch(() => {}),
    pause: () => el.current?.pause(),
    restart: () => {
      if (!el.current) return;
      el.current.currentTime = 0;
      void el.current.play().catch(() => {});
    },
  }));
  useEffect(() => {
    const v = el.current;
    // 离开页面（翻到别的照片）时停止播放
    return () => v?.pause();
  }, []);
  return (
    <View style={[styles.wrap, style]}>
      <video
        ref={el}
        src={uri}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        onEnded={onEnded}
        onPlaying={onPlaying}
        style={{ width: '100%', height: '100%', objectFit: fit, background: 'transparent', display: 'block' }}
      />
    </View>
  );
});

const styles = StyleSheet.create({ wrap: { overflow: 'hidden' } });
