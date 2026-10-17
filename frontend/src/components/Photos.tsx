import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { fileUrl } from '@/lib/api';
import { openViewer as openMedia } from '@/lib/viewer';
import { colors, radius } from '@/theme';

import { PressScale, Txt } from './ui';

/** 待上传的图片：local 是本地 uri，remote 是服务器上已有的文件名 */
export type PhotoItem = { local?: string; remote?: string };

export async function pickImages(limit: number): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.85, // 统一转成 JPEG，顺便解决 iPhone 的 HEIC
    exif: false,
  });
  return res.canceled ? [] : res.assets.map((a) => a.uri);
}

export function PhotoPicker({ value, onChange, max = 9, size = 96 }: { value: PhotoItem[]; onChange: (v: PhotoItem[]) => void; max?: number; size?: number }) {
  return (
    <View style={styles.wrap}>
      {value.map((p, i) => (
        <Animated.View key={p.local ?? p.remote} entering={ZoomIn.springify().damping(15)} exiting={ZoomOut.duration(150)} layout={LinearTransition.springify().damping(18)}>
          <Image source={p.local ?? fileUrl(p.remote, true)} style={[styles.thumb, { width: size, height: size }]} contentFit="cover" />
          <Pressable hitSlop={8} onPress={() => onChange(value.filter((_, j) => j !== i))} style={styles.remove}>
            <X size={12} color={colors.white} strokeWidth={3} />
          </Pressable>
        </Animated.View>
      ))}
      {value.length < max && (
        <Animated.View layout={LinearTransition.springify().damping(18)}>
          <PressScale
            onPress={async () => {
              const uris = await pickImages(max - value.length);
              if (uris.length) onChange([...value, ...uris.map((local) => ({ local }))]);
            }}
            style={[styles.add, { width: size, height: size }]}>
            <ImagePlus size={24} color={colors.muted} />
            <Txt v="caption" style={{ fontSize: 11 }}>
              {value.length}/{max}
            </Txt>
          </PressScale>
        </Animated.View>
      )}
    </View>
  );
}

export function openViewer(photos: string[], index: number) {
  openMedia(
    photos.map((image) => ({ kind: 'image' as const, image })),
    index
  );
}

/** 朋友圈式九宫格：1 张大图，2/4 张两列，其余三列 */
export function PhotoGrid({ photos, width }: { photos: string[]; width: number }) {
  if (!photos.length) return null;
  if (photos.length === 1) {
    return (
      <PressScale haptics={false} onPress={() => openViewer(photos, 0)}>
        <Image source={fileUrl(photos[0])} placeholder={fileUrl(photos[0], true)} style={{ width: width * 0.75, aspectRatio: 4 / 5, borderRadius: radius.md }} contentFit="cover" transition={250} />
      </PressScale>
    );
  }
  const cols = photos.length === 2 || photos.length === 4 ? 2 : 3;
  const gap = 4;
  const cell = (width - gap * (cols - 1)) / cols;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width }}>
      {photos.map((p, i) => (
        <PressScale key={p} haptics={false} onPress={() => openViewer(photos, i)}>
          <Image source={fileUrl(p, true)} style={{ width: cell, height: cell, borderRadius: 10 }} contentFit="cover" transition={200} />
        </PressScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  add: { borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
