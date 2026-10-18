import { useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { claimLook, usePeer } from '@/lib/peer';
import { useCouple } from '@/lib/session';
import type { GalleryItem } from '@/lib/types';
import { openViewerById } from '@/lib/viewer';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Avatar, PressScale, Row, Txt } from './ui';

/**
 * 相册页用：页面在前台时告诉另一半「我在逛相册」，并返回 TA 在看哪张（给网格描边用）。
 */
export function useGalleryPresence() {
  useFocusEffect(
    useCallback(() => {
      const c = claimLook('grid');
      return () => c.release();
    }, [])
  );
  const peer = usePeer();
  const { partner } = useCouple();
  const itemId = peer.online && peer.where === 'viewer' ? peer.itemId : null;
  return { peer, partner, grid: itemId ? { itemId, user: partner } : null };
}

const monthOf = (iso: string) => {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月`;
};

/** 相册顶部：TA 也在看相册时出现，点「看看」打开 TA 正在看的那张 */
export function PeerBanner({ items }: { items: GalleryItem[] }) {
  const peer = usePeer();
  const { partner } = useCouple();
  if (!peer.online || !peer.where) return null;
  const name = partner?.name || 'TA';
  const viewing = peer.where === 'viewer' && peer.itemId ? peer.itemId : null;
  const known = viewing ? items.find((x) => x.id === viewing) : undefined;
  const open = () => viewing && openViewerById(viewing, items).catch((e) => toast((e as Error).message, '⚠️'));
  const body = (
    <Row gap={10} style={styles.box}>
      <View>
        <Avatar user={partner} size={34} />
        <View style={styles.dot} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {name}也在看相册
        </Txt>
        <Txt v="caption" numberOfLines={1}>
          {viewing ? (known ? `正在看 ${monthOf(known.takenAt)} 的一张` : '正在看一张照片') : '正在随便逛逛'}
        </Txt>
      </View>
      {viewing && (
        <Row gap={2} style={styles.action}>
          <Txt v="secondary" color={colors.white} style={{ fontWeight: '700' }}>
            看看
          </Txt>
          <ChevronRight size={15} color={colors.white} />
        </Row>
      )}
    </Row>
  );
  return (
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)} style={{ marginBottom: 12 }}>
      {viewing ? (
        <PressScale scaleTo={0.98} onPress={open} accessibilityLabel={`看看${name}正在看的照片`}>
          {body}
        </PressScale>
      ) : (
        body
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, paddingVertical: 10, paddingLeft: 10, paddingRight: 10 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: '#4CAF78', borderWidth: 2, borderColor: colors.accentSoft },
  action: { backgroundColor: colors.accentStrong, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 8, height: 32 },
});
