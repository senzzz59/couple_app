import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Copy, Heart, Navigation, Pencil, Plus } from 'lucide-react-native';
import { Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePlaceInfo } from '@/components/LivePlaceInfo';
import { StarRating, toast } from '@/components/motion';
import { openViewer } from '@/components/Photos';
import { goBack } from '@/components/Screen';
import { LoadError, Skeleton } from '@/components/Skeleton';
import { Avatar, Button, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { fileUrl } from '@/lib/api';
import { fmtDate } from '@/lib/dates';
import { categoryEmoji, placeCover } from '@/lib/food';
import { openInMaps } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { useCouple } from '@/lib/session';
import { useQuery } from '@/lib/store';
import type { Place, Visit } from '@/lib/types';
import { colors, fonts, radius, sectionTheme, shadow } from '@/theme';

const HEADER = 340;

function VisitItem({ v, i, last }: { v: Visit; i: number; last: boolean }) {
  const { userById } = useCouple();
  return (
    <Animated.View entering={enter(i + 3)} style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center', width: 14 }}>
        <View style={styles.dot} />
        {!last && <View style={styles.line} />}
      </View>
      <View style={{ flex: 1, paddingBottom: 26, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="bodyStrong">{fmtDate(v.date, true)}</Txt>
          <Row gap={6}>
            {v.rating ? <StarRating value={v.rating} size={13} /> : null}
            <Avatar user={userById(v.createdBy)} size={22} />
          </Row>
        </Row>
        {v.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {v.photos.map((p, j) => (
              <PressScale key={p} haptics={false} onPress={() => openViewer(v.photos, j)}>
                <Image source={fileUrl(p, true)} style={styles.visitPhoto} contentFit="cover" transition={200} />
              </PressScale>
            ))}
          </ScrollView>
        )}
        {v.dishes.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {v.dishes.map((d) => (
              <View key={d.name} style={[styles.dish, d.liked && { backgroundColor: colors.accentSoft }]}>
                {d.liked && <Heart size={11} color={colors.accent} fill={colors.accent} />}
                <Txt v="caption" color={colors.ink}>
                  {d.name}
                </Txt>
              </View>
            ))}
          </View>
        )}
        {!!v.note && <Txt v="body" color={colors.inkSoft}>{v.note}</Txt>}
        <PressScale haptics={false} onPress={() => router.push({ pathname: '/visit/new', params: { placeId: v.placeId, id: v.id } })} style={{ alignSelf: 'flex-start' }}>
          <Txt v="caption" style={{ textDecorationLine: 'underline' }}>
            编辑
          </Txt>
        </PressScale>
      </View>
    </Animated.View>
  );
}

export default function PlaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const place = useQuery<Place>(`/api/places/${id}`);
  const visits = useQuery<Visit[]>(`/api/visits?place=${id}`);
  const p = place.data;

  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const cover = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(y.value, [-HEADER, 0, HEADER], [-HEADER / 2, 0, HEADER * 0.4]) }, { scale: interpolate(y.value, [-HEADER, 0], [2, 1], 'clamp') }],
  }));
  const topBar = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [HEADER - 140, HEADER - 80], [0, 1], 'clamp') }));

  if (!p) {
    // 加载中 / 加载失败：也要能返回，不能是一片空白
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {place.error ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <LoadError message={place.error} onRetry={place.refresh} />
          </View>
        ) : (
          <>
            <Skeleton h={HEADER} r={0} />
            <View style={[styles.sheet, { marginTop: -32, gap: 12 }]}>
              <Skeleton w="55%" h={26} r={9} />
              <Skeleton w="35%" h={14} />
              <Skeleton w="80%" h={14} style={{ marginTop: 8 }} />
            </View>
          </>
        )}
        <View style={{ position: 'absolute', top: insets.top + 6, left: 12 }}>
          <IconButton icon={ChevronLeft} onPress={goBack} label="返回" />
        </View>
      </View>
    );
  }
  const coverName = placeCover(p, visits.data);
  const visited = p.status === 'visited';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.View style={[styles.cover, { height: HEADER }, cover]}>
        {coverName ? (
          <Image source={fileUrl(coverName)} placeholder={fileUrl(coverName, true)} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: sectionTheme.eats.bg, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 110 }}>{categoryEmoji(p.category)}</Text>
          </View>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.25)', 'transparent', 'transparent']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: HEADER - 32, paddingBottom: insets.bottom + 110 }}>
        <View style={styles.sheet}>
          <Animated.View entering={enter(0)}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[styles.status, { backgroundColor: visited ? sectionTheme.todos.bg : sectionTheme.eats.bg }]}>
                  <Txt v="label" color={visited ? colors.sageInk : colors.butterInk}>
                    {visited ? '吃过啦' : '想去'}
                  </Txt>
                </View>
                <Txt v="title">{p.name}</Txt>
                <Row gap={10}>
                  {p.rating ? <StarRating value={p.rating} size={16} /> : null}
                  <Txt v="caption">{[p.category, p.price ? `¥${p.price}/人` : null].filter(Boolean).join(' · ')}</Txt>
                </Row>
              </View>
            </Row>
          </Animated.View>

          <Animated.View entering={enter(1)} style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <PressScale onPress={() => openInMaps(p).catch(() => toast('打不开高德地图', '⚠️'))} style={[styles.action, { backgroundColor: colors.ink }]}>
              <Navigation size={18} color={colors.white} />
              <Txt v="bodyStrong" color={colors.white}>
                {p.amapUrl && (p.lat == null || p.lng == null) ? '打开高德地点' : '高德导航'}
              </Txt>
            </PressScale>
            {p.xhsUrl && (
              <PressScale onPress={() => Linking.openURL(p.xhsUrl!).catch(() => toast('打不开这个链接', '⚠️'))} style={[styles.action, { backgroundColor: '#FF2442' }]}>
                <Txt v="bodyStrong" color={colors.white}>
                  小红书
                </Txt>
              </PressScale>
            )}
            {p.address && (
              <PressScale
                onPress={async () => {
                  await Clipboard.setStringAsync(`${p.name} ${p.address}`);
                  haptic.success();
                  toast('地址已复制', '📋');
                }}
                style={styles.iconAction}>
                <Copy size={18} color={colors.ink} />
              </PressScale>
            )}
          </Animated.View>

          {(p.address || p.note) && (
            <Animated.View entering={enter(2)} style={styles.infoCard}>
              {p.address && (
                <View style={{ gap: 2 }}>
                  <Txt v="label">地址</Txt>
                  <Txt v="body">{[p.city, p.address].filter(Boolean).join(' ')}</Txt>
                </View>
              )}
              {p.note && (
                <View style={{ gap: 2 }}>
                  <Txt v="label">备注</Txt>
                  <Txt v="body">{p.note}</Txt>
                </View>
              )}
            </Animated.View>
          )}

          {(p.amapUrl || p.lat != null) && <View style={{ marginTop: 18 }}><LivePlaceInfo key={`${p.amapUrl}:${p.lat}:${p.lng}`} destination={p} /></View>}

          <Row style={{ justifyContent: 'space-between', marginTop: 28, marginBottom: 16 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink }}>Our visits</Text>
            <Txt v="caption">{visits.data?.length ?? 0} 次</Txt>
          </Row>
          {visits.data?.length === 0 && (
            <Txt v="body" color={colors.muted} style={{ marginBottom: 12 }}>
              还没有记录。去吃的那天，记下点了什么、好不好吃吧～
            </Txt>
          )}
          {visits.data?.map((v, i) => (
            <VisitItem key={v.id} v={v} i={i} last={i === visits.data!.length - 1} />
          ))}
        </View>
      </Animated.ScrollView>

      {/* 滚动后出现的顶栏 */}
      <Animated.View pointerEvents="none" style={[styles.topBar, { height: insets.top + 56 }, topBar]}>
        <Txt v="bodyStrong" numberOfLines={1} style={{ marginBottom: 16, maxWidth: width - 140 }}>
          {p.name}
        </Txt>
      </Animated.View>
      <Row style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, justifyContent: 'space-between' }}>
        <IconButton icon={ChevronLeft} onPress={goBack} label="返回" />
        <IconButton icon={Pencil} onPress={() => router.push({ pathname: '/place/edit', params: { id: p.id } })} />
      </Row>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={visited ? '再去一次，记录一下' : '我们去过了！记录一下'}
          icon={Plus}
          variant={visited ? 'primary' : 'accent'}
          onPress={() => router.push({ pathname: '/visit/new', params: { placeId: p.id } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, minHeight: 600 },
  status: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  action: { flex: 1, height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow },
  iconAction: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  infoCard: { marginTop: 18, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 14, ...shadow },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, marginTop: 5, borderWidth: 3, borderColor: colors.accentSoft },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 4 },
  visitPhoto: { width: 120, height: 150, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  dish: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: 'rgba(250,246,240,0.92)' },
});
