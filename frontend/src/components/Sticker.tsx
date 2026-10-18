import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { mediaUrl } from '@/lib/media';
import { builtinSticker } from '@/lib/stickers';
import { colors, fonts } from '@/theme';

import { Blob } from './Mascot';

/** 显示一个表情包：内置的团子表情，或自定义表情图片 */
export function Sticker({ id, size = 84, animated = false }: { id: string; size?: number; animated?: boolean }) {
  const b = builtinSticker(id);
  if (!b) {
    return <Image source={mediaUrl(id, 'thumb')} style={{ width: size, height: size, borderRadius: 12 }} contentFit="contain" transition={150} />;
  }
  return (
    // 团子放上面、字放下面：字不能盖住嘴（亲亲、哈哈哈这些表情全靠嘴）
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-start', paddingTop: size * 0.03 }}>
      <Blob who={b.who} mood={b.mood} size={size * 0.7} bob={animated} />
      <Text style={[styles.emoji, { fontSize: size * 0.24, right: size * 0.04, top: size * 0.02 }]}>{b.emoji}</Text>
      <View style={[styles.caption, { paddingHorizontal: size * 0.09, bottom: -2 }]}>
        <Text style={{ fontFamily: fonts.round, fontSize: Math.max(10, size * 0.15), color: colors.ink }} numberOfLines={1}>
          {b.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: { position: 'absolute' },
  caption: { position: 'absolute', backgroundColor: colors.surface, borderRadius: 99, paddingVertical: 1, borderWidth: 1, borderColor: colors.line },
});
