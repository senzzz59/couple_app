import { Image } from 'expo-image';
import { Bike, Car, ChevronRight, Footprints, MapPin, RefreshCw, Star, TrainFront, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { type MapDestination } from '@/lib/amap';
import { type AmapDetails, type AmapJourney, type TravelMode, travelDistance, travelTime } from '@/lib/amapLive';
import { AMAP_KEY, openAmapPlace } from '@/lib/geo';
import { locate } from '@/lib/location';
import { colors, fonts, radius } from '@/theme';
import { toast } from './motion';
import { Button, PressScale, Row, Txt } from './ui';

const modes = [
  { key: 'walking', label: '步行', Icon: Footprints },
  { key: 'cycling', label: '骑行', Icon: Bike },
  { key: 'driving', label: '驾车', Icon: Car },
  { key: 'transit', label: '公交', Icon: TrainFront },
] satisfies { key: TravelMode; label: string; Icon: typeof Bike }[];

/** External facts are refreshed on entry and never replace personal ratings or notes. */
export function LivePlaceInfo({ destination }: { destination: MapDestination }) {
  const [data, setData] = useState<AmapDetails>();
  const [loadedRefresh, setLoadedRefresh] = useState(-1);
  const [refresh, setRefresh] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);
  const [journey, setJourney] = useState<AmapJourney>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const generation = useRef(0);
  const url = destination.amapUrl;
  const loading = !!url && loadedRefresh !== refresh;
  useEffect(() => {
    const version = ++generation.current;
    if (!url) return () => { generation.current = version + 1; };
    let active = true;
    api.post<AmapDetails>('/api/amap/details', { url, key: AMAP_KEY }).then((result) => {
      if (active && generation.current === version) setData(result);
    }).catch(() => {
      if (active) setData({ place: null, checkedAt: '', message: '暂时没读到店铺资料，点右上角刷新试试' });
    }).finally(() => { if (active) setLoadedRefresh(refresh); });
    return () => { active = false; generation.current = version + 1; };
  }, [url, refresh, destination.lat, destination.lng]);
  const place = data?.place;
  const lat = place?.lat ?? destination.lat;
  const lng = place?.lng ?? destination.lng;
  const photos = place?.photos ?? [];

  const getJourney = async () => {
    if (lat == null || lng == null || locating) return;
    const version = generation.current;
    setLocating(true);
    setLocationError('');
    setJourney(undefined);
    try {
      const origin = await locate();
      if (!origin) throw new Error('暂时拿不到位置，稍后再试');
      const result = await api.post<AmapJourney>('/api/amap/journey', {
        key: AMAP_KEY, origin: { lat: origin.lat, lng: origin.lng }, destination: { lat, lng }, destinationCity: place?.cityCode || destination.city || '',
      });
      if (generation.current === version) setJourney(result);
    } catch (error) {
      if (generation.current === version) setLocationError((error as Error).message || '暂时无法计算路线，请重试');
    } finally { if (generation.current === version) setLocating(false); }
  };
  const openReviews = () => openAmapPlace({ ...destination, lat, lng }).catch(() => toast('打不开高德地图', '⚠️'));

  return (
    <View style={{ gap: 14 }}>
      {!!url && <View style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}><View style={styles.dot} /><Txt v="bodyStrong">店铺小档案</Txt><Txt v="caption">高德</Txt></Row>
          <PressScale accessibilityLabel="刷新高德店铺信息" disabled={loading} onPress={() => { setRefresh((n) => n + 1); setJourney(undefined); setLocationError(''); setLocating(false); }} style={styles.refresh}>
            {loading ? <ActivityIndicator size="small" color={colors.muted} /> : <RefreshCw size={15} color={colors.muted} />}
          </PressScale>
        </Row>
        {loading ? <Txt v="caption">加载中…</Txt> : place ? <>
          <Row gap={0} style={{ alignItems: 'flex-start' }}>
            <View style={styles.stat}><Row gap={4}><Star size={15} color={colors.peachInk} fill={colors.peach} /><Txt style={styles.number}>{place.rating ?? '—'}</Txt></Row><Txt v="caption">高德评分</Txt></View>
            <View style={[styles.stat, styles.divider]}><Txt style={styles.number}>{place.price != null ? `¥${place.price}` : '—'}</Txt><Txt v="caption">参考人均</Txt></View>
            <View style={[styles.stat, styles.divider]}><Txt style={styles.number}>{photos.length || '—'}</Txt><Txt v="caption">店铺照片</Txt></View>
          </Row>
          {!!place.hours && <Txt v="caption" color={colors.inkSoft}>营业时间 · {place.hours}</Txt>}
          {photos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map((p, i) => <PressScale key={`${p.url}-${i}`} accessibilityLabel={`查看店铺照片${i + 1}`} onPress={() => setPhoto(i)}><Image source={p.url} style={styles.thumb} contentFit="cover" transition={200} /></PressScale>)}
          </ScrollView>}
          {data?.checkedAt && <Txt v="caption" style={{ fontSize: 11 }}>查询于 {new Date(data.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 以高德实际信息为准</Txt>}
        </> : <Txt v="caption">{data?.message || '这家店暂未提供更多资料'}</Txt>}
        <PressScale onPress={openReviews} style={styles.reviewLink}>
          <View style={{ flex: 1, gap: 3 }}><Txt v="bodyStrong" style={{ fontSize: 14 }}>去高德看评价与晒图</Txt><Txt v="caption" style={{ fontSize: 11 }}>更多真实体验，在高德店铺页查看</Txt></View>
          <ChevronRight size={17} color={colors.muted} />
        </PressScale>
      </View>}
      <View style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 3 }}><Txt v="bodyStrong">怎么去呢？</Txt><Txt v="caption">从你现在的位置出发</Txt></View>
          <MapPin size={22} color={colors.accentStrong} />
        </Row>
        {lat == null || lng == null ? <Txt v="caption">选定高德门店后，就能看看路上要多久啦</Txt> : <>
          {journey && <>
            <View style={styles.travelGrid}>
              {modes.map(({ key, label, Icon }) => {
                const option = journey.options.find((o) => o.mode === key);
                return <View key={key} style={styles.travelItem}>
                  <Icon size={20} color={colors.sageInk} /><Txt v="caption" color={colors.inkSoft}>{label}</Txt>
                  <Txt v="bodyStrong" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 13, maxWidth: '100%', textAlign: 'center' }}>{travelTime(option?.seconds ?? null)}</Txt>
                  <Txt v="caption" style={{ fontSize: 10, textAlign: 'center' }}>{option?.seconds == null ? '暂未返回路线' : travelDistance(option.meters)}</Txt>
                </View>;
              })}
            </View>
            {journey.options.every((o) => o.seconds == null) && <Txt v="caption" color={colors.peachInk}>{journey.options.find((o) => o.message)?.message || '暂时没有可用路线，可以前往高德查看'}</Txt>}
            <Txt v="caption" style={{ fontSize: 11 }}>高德预计耗时 · 查询于 {new Date(journey.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}，路况和班次可能变化</Txt>
          </>}
          {!!locationError && <Txt v="caption" color={colors.peachInk}>{locationError}</Txt>}
          <Button title={journey ? '更新我的位置与路线' : locationError ? '重新获取位置' : '看看现在出发要多久'} variant="secondary" onPress={getJourney} loading={locating} />
          {!journey && !locationError && <Txt v="caption" style={{ fontSize: 11 }}>点击后获取位置，仅用于本次路线计算</Txt>}
        </>}
      </View>
      <Modal visible={photo != null} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <View style={styles.gallery}>
          <Row style={{ justifyContent: 'space-between', padding: 24, paddingTop: 60 }}><Txt color={colors.white}>高德店铺照片 · {photo != null ? photo + 1 : 1}/{photos.length}</Txt><PressScale accessibilityLabel="关闭店铺照片" onPress={() => setPhoto(null)} style={{ padding: 10 }}><X color={colors.white} size={22} /></PressScale></Row>
          {photo != null && photos[photo] && <Image source={photos[photo].url} style={{ flex: 1 }} contentFit="contain" />}
          <Row style={{ padding: 24, paddingBottom: 48, justifyContent: 'space-between' }}><Button title="上一张" disabled={!photo} onPress={() => setPhoto((n) => Math.max(0, (n ?? 0) - 1))} /><Button title="下一张" disabled={photo == null || photo >= photos.length - 1} onPress={() => setPhoto((n) => Math.min(photos.length - 1, (n ?? 0) + 1))} /></Row>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  refresh: { padding: 10, margin: -6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 3 }, divider: { borderLeftWidth: 1, borderColor: colors.line },
  number: { fontFamily: fonts.display, fontSize: 25, lineHeight: 32, color: colors.ink },
  thumb: { width: 104, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  reviewLink: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  travelGrid: { flexDirection: 'row', gap: 4 }, travelItem: { flex: 1, paddingVertical: 12, paddingHorizontal: 2, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', gap: 5 },
  gallery: { flex: 1, backgroundColor: 'rgba(30,20,24,0.98)' },
});
