import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { forwardRef, useImperativeHandle } from 'react';
import { Linking, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export type VideoHandle = { play: () => void; pause: () => void; restart: () => void };

export type VideoProps = {
  uri: string;
  poster?: string;
  style?: StyleProp<ViewStyle>;
  controls?: boolean;
  controlsVisible?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  fit?: 'contain' | 'cover';
  onEnded?: () => void;
  onPlaying?: () => void;
};

/** 原生 App 暂未内置播放器：显示封面，点一下用系统播放器打开（网页版用 Video.web.tsx） */
export const Video = forwardRef<VideoHandle, VideoProps>(function Video({ uri, poster, style, fit = 'contain' }, ref) {
  useImperativeHandle(ref, () => ({ play: () => {}, pause: () => {}, restart: () => {} }));
  return (
    <Pressable onPress={() => Linking.openURL(uri)} style={[styles.wrap, style]}>
      {poster ? <Image source={poster} style={StyleSheet.absoluteFill} contentFit={fit} /> : null}
      <View style={styles.play}>
        <Play size={28} color="#fff" fill="#fff" />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
