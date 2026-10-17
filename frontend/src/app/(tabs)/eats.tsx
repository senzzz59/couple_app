import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Dices, Map as MapIcon, MapPin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { Segmented, StarRating } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { PlaceTicket, VisitStamp } from '@/components/PlaceTicket';
import { QueryFallback } from '@/components/Skeleton';
import { Button, Chip, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { fileUrl } from '@/lib/api';
import { invalidate, useQuery } from '@/lib/store';
import { categoryEmoji, categoryTone, placeCover } from '@/lib/food';
import type { Place, PlaceStatus, Visit } from '@/lib/types';
import { colors, radius, shadow } from '@/theme';

function VisitedCard({ p, cover, count, i }: { p: Place; cover: string | null; count: number; i: number }) {
  return (
    <Animated.View entering={enter(i)} exiting={FadeOut.duration(150)} layout={LinearTransition.springify().damping(18)}>
      <PressScale onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} style={styles.bigCard}>
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={fileUrl(cover)} placeholder={fileUrl(cover, true)} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: categoryTone(p.category ?? p.name).bg, overflow: 'hidden' }]}>
              <Text style={styles.coverEmoji}>{categoryEmoji(p.category)}</Text>
            </View>
          )}
          {count > 0 && <VisitStamp count={count} />}
        </View>
        <View style={{ padding: 16, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="heading" numberOfLines={1} style={{ flex: 1 }}>
              {p.name}
            </Txt>
            {p.price ? <Txt v="secondary">¥{p.price}/人</Txt> : null}
          </Row>
          <Row gap={10}>
            {p.rating ? <StarRating value={p.rating} size={14} /> : null}
            {p.category && <Txt v="secondary">{p.category}</Txt>}
          </Row>
          {(p.address || p.city) && (
            <Row gap={4}>
              <MapPin size={12} color={colors.muted} />
              <Txt v="caption" numberOfLines={1} style={{ flex: 1 }}>
                {[p.city, p.address].filter(Boolean).join(' · ')}
              </Txt>
            </Row>
          )}
        </View>
      </PressScale>
    </Animated.View>
  );
}

export default function Eats() {
  const places = useQuery<Place[]>('/api/places');
  const visits = useQuery<Visit[]>('/api/visits');
  const [tab, setTab] = useState<PlaceStatus>('want');
  const [cat, setCat] = useState<string | null>(null);

  const list = useMemo(() => (places.data ?? []).filter((p) => p.status === tab), [places.data, tab]);
  const cats = useMemo(() => [...new Set(list.map((p) => p.category).filter(Boolean))] as string[], [list]);
  const shown = cat ? list.filter((p) => p.category === cat) : list;
  const visitCount = (id: string) => visits.data?.filter((v) => v.placeId === id).length ?? 0;
  // 约会票的票号：按收藏的先后顺序编号
  const ticketNo = useMemo(() => {
    const sorted = [...(places.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return new Map(sorted.map((p, i) => [p.id, i + 1]));
  }, [places.data]);
  const { width } = useWindowDimensions();
  const ticketW = Math.floor((Math.min(width, 720) - 32 - 12) / 2);

  return (
    <Screen
      tab
      title="美食"
      onRefresh={async () => {
        invalidate('places');
        invalidate('visits');
      }}
      right={
        <Row>
          <IconButton icon={MapIcon} onPress={() => router.push('/footprints')} />
          <IconButton icon={Dices} onPress={() => router.push('/roulette')} bg={colors.sky} color={colors.skyInk} />
          <IconButton icon={Plus} onPress={() => router.push({ pathname: '/place/edit', params: { status: tab } })} />
        </Row>
      }>
      <Segmented
        options={[
          { key: 'want', label: `想去 ${places.data?.filter((p) => p.status === 'want').length ?? ''}` },
          { key: 'visited', label: `吃过 ${places.data?.filter((p) => p.status === 'visited').length ?? ''}` },
        ]}
        value={tab}
        onChange={(k) => {
          setTab(k);
          setCat(null);
        }}
      />
      {cats.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label="全部" active={!cat} onPress={() => setCat(null)} />
          {cats.map((c) => (
            <Chip key={c} label={`${categoryEmoji(c)} ${c}`} active={cat === c} onPress={() => setCat(cat === c ? null : c)} />
          ))}
        </ScrollView>
      )}

      <View style={{ marginTop: 16 }}>
        <QueryFallback q={places} kind={tab === 'want' ? 'grid' : 'cover'} count={tab === 'want' ? 4 : 2} />
        {places.data && shown.length === 0 ? (
          tab === 'want' ? (
            <Empty emoji="🍜" title="还没有想去的店" hint="复制小红书或高德的分享链接就能存" action={<Button title="收藏一家店" onPress={() => router.push('/place/edit')} />} />
          ) : (
            <Empty emoji="📸" title="还没有吃过的记录" />
          )
        ) : tab === 'visited' ? (
          <View style={{ gap: 14 }}>
            {shown.map((p, i) => (
              <VisitedCard key={p.id} p={p} i={i} cover={placeCover(p, visits.data)} count={visitCount(p.id)} />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {shown.map((p, i) => (
              <Animated.View key={p.id} entering={enter(i)} exiting={FadeOut.duration(150)} layout={LinearTransition.springify().damping(18)}>
                <PlaceTicket p={p} no={ticketNo.get(p.id) ?? i + 1} cover={p.cover} width={ticketW} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} />
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderCurve: 'continuous', ...shadow },
  coverWrap: { height: 190, backgroundColor: colors.surfaceAlt },
  coverEmoji: { position: 'absolute', right: 18, bottom: -20, fontSize: 120, transform: [{ rotate: '-14deg' }] },
});
