import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Txt } from '@/components/ui';
import { fileUrl } from '@/lib/api';
import { colors } from '@/theme';

/** 全屏看图：左右滑动翻页 */
export default function Viewer() {
  const { photos, index } = useLocalSearchParams<{ photos: string; index: string }>();
  const list = (photos ?? '').split(',').filter(Boolean);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cur, setCur] = useState(Number(index) || 0);

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
      <FlatList
        data={list}
        horizontal
        pagingEnabled
        initialScrollIndex={cur}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(x) => x}
        onMomentumScrollEnd={(e) => setCur(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height, justifyContent: 'center' }}>
            <Image source={fileUrl(item)} placeholder={fileUrl(item, true)} style={{ width, height: height * 0.8 }} contentFit="contain" transition={200} />
          </View>
        )}
      />
      <View style={[styles.top, { top: insets.top + 8 }]}>
        <Txt v="bodyStrong" color={colors.white}>
          {list.length > 1 ? `${cur + 1} / ${list.length}` : ''}
        </Txt>
        <IconButton icon={X} bg="rgba(255,255,255,0.15)" color={colors.white} onPress={() => router.back()} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 20, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
