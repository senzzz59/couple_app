import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { fileUrl } from '@/lib/api';
import { categoryEmoji, categoryTone } from '@/lib/food';
import type { Place } from '@/lib/types';
import { colors, fonts } from '@/theme';

import { PressScale, Txt } from './ui';

const STUB = 116;
const NOTCH = 22;

/**
 * 「想去」的店做成一张约会票：上面是票面（菜系颜色 + 放大的图标，或店铺封面），
 * 中间一条撕票线，下面是票根（店名、菜系、人均）。左上角印着收藏顺序的票号。
 */
export function PlaceTicket({ p, no, cover, onPress, width }: { p: Place; no: number; cover?: string | null; onPress: () => void; width: number }) {
  const tone = categoryTone(p.category ?? p.name);
  const meta = [p.category, p.price ? `¥${p.price}` : null, p.city].filter(Boolean).join(' · ');
  return (
    <PressScale onPress={onPress} scaleTo={0.96} style={[styles.ticket, { width }]} accessibilityLabel={p.name}>
      <View style={[styles.face, { backgroundColor: tone.bg }]}>
        {cover ? (
          <>
            <Image source={fileUrl(cover)} placeholder={fileUrl(cover, true)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            <LinearGradient colors={['rgba(0,0,0,0.28)', 'transparent']} style={[StyleSheet.absoluteFill, { height: 56 }]} />
          </>
        ) : (
          <Text style={styles.emoji}>{categoryEmoji(p.category)}</Text>
        )}
        <Text style={[styles.no, { color: cover ? colors.white : tone.ink }]}>NO.{String(no).padStart(3, '0')}</Text>
      </View>

      {/* 撕票线：两侧的半圆缺口 + 虚线 */}
      <View style={styles.perforation} pointerEvents="none">
        <View style={[styles.notch, { left: -NOTCH / 2 }]} />
        <View style={styles.dash} />
        <View style={[styles.notch, { right: -NOTCH / 2 }]} />
      </View>

      <View style={styles.stub}>
        <Txt v="bodyStrong" numberOfLines={2} style={{ lineHeight: 22 }}>
          {p.name}
        </Txt>
        {!!meta && (
          <Txt v="caption" numberOfLines={1} color={tone.ink}>
            {meta}
          </Txt>
        )}
      </View>
    </PressScale>
  );
}

/** 「吃过」的店封面上盖的章 */
export function VisitStamp({ count }: { count: number }) {
  return (
    <View style={styles.stamp} pointerEvents="none">
      <View style={styles.stampInner}>
        <Text style={styles.stampSmall}>去过</Text>
        <Text style={styles.stampBig}>{count}</Text>
        <Text style={styles.stampSmall}>次</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    boxShadow: '0 1px 2px rgba(42,31,35,0.05), 0 8px 22px rgba(42,31,35,0.06)',
  },
  face: { height: STUB, overflow: 'hidden' },
  emoji: { position: 'absolute', right: -10, bottom: -14, fontSize: 84, transform: [{ rotate: '-14deg' }] },
  no: { position: 'absolute', left: 14, top: 12, fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1.2 },
  perforation: { height: 0, justifyContent: 'center' },
  notch: { position: 'absolute', top: -NOTCH / 2, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: colors.bg },
  dash: { marginHorizontal: NOTCH / 2 + 6, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.faint },
  stub: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, gap: 4, minHeight: 82, justifyContent: 'center' },
  stamp: { position: 'absolute', right: 12, top: 12, width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], backgroundColor: 'rgba(220,83,120,0.82)' },
  stampInner: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  stampSmall: { color: colors.white, fontFamily: fonts.round, fontSize: 9, lineHeight: 11 },
  stampBig: { color: colors.white, fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 20 },
});
