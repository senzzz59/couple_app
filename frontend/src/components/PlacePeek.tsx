import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Clock, MapPin, Navigation, NotebookPen, Star } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { api, fileUrl } from '@/lib/api';
import type { AmapDetails } from '@/lib/amapLive';
import { fmtDate } from '@/lib/dates';
import { categoryEmoji, categoryTone, placeArea } from '@/lib/food';
import { AMAP_KEY } from '@/lib/geo';
import { chooseTravel } from './TravelPicker';
import { fmtKm } from '@/lib/location';
import type { Place, Visit } from '@/lib/types';
import { colors, fonts, radius } from '@/theme';

import { PressScale, Row, Txt } from './ui';

// 同一家店这次打开 App 只查一次高德
const details = new Map<string, Promise<AmapDetails | null>>();
function amapDetails(url: string) {
  let p = details.get(url);
  if (!p) {
    p = api.post<AmapDetails>('/api/amap/details', { url, key: AMAP_KEY }).catch(() => null);
    details.set(url, p);
  }
  return p;
}

type Slide = { key: string; source: 'ours' | 'amap'; uri: string; thumb?: string };

/**
 * 长按店铺卡片弹出的简介：照片（我们拍的 + 高德的）、人均、评分、距离、营业时间、去过几次。
 * 点卡片外面就收起来。
 */
export function PlacePeek({ place, visits, km, onClose }: { place: Place | null; visits: Visit[]; km?: number | null; onClose: () => void }) {
  // 关闭时留着上一家店的内容，淡出动画里不会突然变空
  const [last, setLast] = useState(place);
  if (place && place !== last) setLast(place);
  return (
    <Modal visible={!!place} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {last && <PeekBody key={last.id} p={last} visits={visits} km={km ?? null} onClose={onClose} />}
    </Modal>
  );
}

function PeekBody({ p, visits, km, onClose }: { p: Place; visits: Visit[]; km: number | null; onClose: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const width = Math.min(sw - 40, 380);
  const photoH = Math.round(width * 0.72);
  const [amap, setAmap] = useState<AmapDetails | null | undefined>(p.amapUrl ? undefined : null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!p.amapUrl) return;
    let alive = true;
    amapDetails(p.amapUrl).then((d) => alive && setAmap(d));
    return () => {
      alive = false;
    };
  }, [p.amapUrl]);

  const mine = useMemo(() => visits.filter((v) => v.placeId === p.id).sort((a, b) => b.date.localeCompare(a.date)), [visits, p.id]);
  const slides = useMemo(() => {
    const own = [...new Set([p.cover, ...mine.flatMap((v) => v.photos)].filter(Boolean) as string[])].slice(0, 8);
    const out: Slide[] = own.map((name) => ({ key: name, source: 'ours', uri: fileUrl(name)!, thumb: fileUrl(name, true) }));
    const remote = amap?.place?.photos.map((x) => x.url) ?? (p.amapPhoto ? [p.amapPhoto] : []);
    for (const url of remote.slice(0, 6)) out.push({ key: url, source: 'amap', uri: url });
    return out;
  }, [p.cover, p.amapPhoto, mine, amap]);

  const live = amap?.place;
  const price = p.price ?? live?.price ?? null;
  const rating = p.rating ?? live?.rating ?? null;
  const ratingBy = p.rating ? '我们打的' : '高德评分';
  const where = [placeArea(p) ?? p.city, p.address].filter(Boolean).join(' · ');
  const liked = [...new Set(mine.flatMap((v) => v.dishes.filter((d) => d.liked).map((d) => d.name)))].slice(0, 4);
  const tone = categoryTone(p.category ?? p.name);
  const go = (fn: () => void) => {
    onClose();
    setTimeout(fn, 60);
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="收起" />
      <Animated.View entering={ZoomIn.springify().damping(16).stiffness(220)} style={[styles.card, { width, maxHeight: sh * 0.86 }]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          <View style={{ width, height: photoH, backgroundColor: tone.bg }}>
            {slides.length ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={32}
                onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
                {slides.map((s) => (
                  <Image key={s.key} source={s.uri} placeholder={s.thumb} style={{ width, height: photoH }} contentFit="cover" transition={200} />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.blank}>
                <Text style={{ fontSize: photoH * 0.42 }}>{categoryEmoji(p.category)}</Text>
              </View>
            )}
            {slides.length > 0 && (
              <View style={styles.source} pointerEvents="none">
                <Text style={styles.sourceText}>
                  {slides[Math.min(index, slides.length - 1)].source === 'ours' ? '我们拍的' : '高德'}
                  {slides.length > 1 ? `  ${Math.min(index, slides.length - 1) + 1}/${slides.length}` : ''}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.body}>
            <View style={{ gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>
                {p.name}
              </Text>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {!!p.category && (
                  <View style={[styles.cat, { backgroundColor: tone.bg }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: tone.ink }}>
                      {categoryEmoji(p.category)} {p.category}
                    </Text>
                  </View>
                )}
                <Txt v="secondary">{mine.length ? `去过 ${mine.length} 次 · 上次 ${fmtDate(mine[0].date)}` : `${fmtDate(new Date(p.createdAt))}收藏 · 还没去过`}</Txt>
              </Row>
            </View>

            <View style={styles.stats}>
              <Stat value={price ? `¥${price}` : '—'} label="人均" />
              <Stat
                value={
                  rating ? (
                    <Row gap={3}>
                      <Star size={15} color={colors.peachInk} fill={colors.peach} />
                      <Text style={styles.statValue}>{rating}</Text>
                    </Row>
                  ) : (
                    '—'
                  )
                }
                label={rating ? ratingBy : '评分'}
              />
              <Stat value={km != null ? fmtKm(km) : '—'} label="离我" />
            </View>

            {!!where && <Line icon={<MapPin size={15} color={colors.muted} />} text={where} />}
            {!!live?.hours && <Line icon={<Clock size={15} color={colors.muted} />} text={live.hours} />}
            {amap === undefined && <Txt v="secondary">正在看高德上的资料…</Txt>}
            {liked.length > 0 && <Line icon={<Text style={{ fontSize: 14 }}>❤️</Text>} text={`爱点 ${liked.join('、')}`} />}
            {!!p.note && (
              <View style={styles.note}>
                <Txt v="body" color={colors.inkSoft} numberOfLines={4}>
                  {p.note}
                </Txt>
              </View>
            )}
          </View>
        </ScrollView>

        <Animated.View entering={FadeIn.delay(120)} style={styles.actions}>
          <Action icon={<Navigation size={17} color={colors.white} />} label="导航" dark onPress={() => go(() => chooseTravel(p))} />
          <Action icon={<NotebookPen size={17} color={colors.ink} />} label="记一次" onPress={() => go(() => router.push({ pathname: '/visit/new', params: { placeId: p.id } }))} />
          <Action label="详情" onPress={() => go(() => router.push({ pathname: '/place/[id]', params: { id: p.id } }))} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <View style={styles.stat}>
      {typeof value === 'string' ? <Text style={styles.statValue}>{value}</Text> : value}
      <Txt v="caption">{label}</Txt>
    </View>
  );
}

function Line({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Row gap={8} style={{ alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}>{icon}</View>
      <Txt v="secondary" color={colors.inkSoft} style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </Txt>
    </Row>
  );
}

function Action({ icon, label, onPress, dark }: { icon?: ReactNode; label: string; onPress: () => void; dark?: boolean }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.94} style={[styles.action, dark && { backgroundColor: colors.ink }]}>
      {icon}
      <Text style={{ fontSize: 15, fontWeight: '600', color: dark ? colors.white : colors.ink }}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(42,31,35,0.48)' },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderCurve: 'continuous', boxShadow: '0 20px 60px rgba(42,31,35,0.3)' },
  blank: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  source: { position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: 'rgba(42,31,35,0.55)' },
  sourceText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  body: { padding: 18, gap: 14 },
  name: { fontFamily: fonts.round, fontSize: 22, lineHeight: 30, color: colors.ink },
  cat: { paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  note: { backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  action: { flex: 1, flexDirection: 'row', gap: 6, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
