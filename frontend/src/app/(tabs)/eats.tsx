import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Dices, Map as MapIcon, MapPin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { Segmented, StarRating } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Button, Chip, Empty, enter, IconButton, PressScale, Row, Txt } from '@/components/ui';
import { fileUrl } from '@/lib/api';
import { invalidate, useQuery } from '@/lib/store';
import { categoryEmoji, placeCover } from '@/lib/food';
import type { Place, PlaceStatus, Visit } from '@/lib/types';
import { colors, fonts, radius, sectionTheme, shadow } from '@/theme';

function VisitedCard({ p, cover, count, i }: { p: Place; cover: string | null; count: number; i: number }) {
  return (
    <Animated.View entering={enter(i)} exiting={FadeOut.duration(150)} layout={LinearTransition.springify().damping(18)}>
      <PressScale onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} style={styles.bigCard}>
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={fileUrl(cover)} placeholder={fileUrl(cover, true)} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: sectionTheme.eats.bg, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 56 }}>{categoryEmoji(p.category)}</Text>
            </View>
          )}
          {count > 0 && (
            <View style={styles.badge}>
              <Txt v="caption" color={colors.white} style={{ fontWeight: '700' }}>
                去过 {count} 次
              </Txt>
            </View>
          )}
        </View>
        <View style={{ padding: 16, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="heading" numberOfLines={1} style={{ flex: 1 }}>
              {p.name}
            </Txt>
            {p.price ? <Txt v="caption">¥{p.price}/人</Txt> : null}
          </Row>
          <Row gap={10}>
            {p.rating ? <StarRating value={p.rating} size={14} /> : null}
            {p.category && <Txt v="caption">{p.category}</Txt>}
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

function WantCard({ p, i }: { p: Place; i: number }) {
  return (
    <Animated.View entering={enter(i)} exiting={FadeOut.duration(150)} layout={LinearTransition.springify().damping(18)} style={{ width: '48.5%' }}>
      <PressScale onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} style={styles.wantCard}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 34 }}>{categoryEmoji(p.category)}</Text>
          {p.xhsUrl && (
            <View style={styles.xhs}>
              <Txt style={{ fontSize: 10, fontWeight: '800' }} color={colors.white}>
                小红书
              </Txt>
            </View>
          )}
        </Row>
        <View style={{ gap: 2 }}>
          <Txt v="bodyStrong" numberOfLines={2}>
            {p.name}
          </Txt>
          <Txt v="caption" numberOfLines={1} color={sectionTheme.eats.ink}>
            {[p.category, p.price ? `¥${p.price}` : null, p.city].filter(Boolean).join(' · ') || '想去'}
          </Txt>
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

  return (
    <Screen
      tab
      title="美食"
      subtitle="OUR FOOD MAP"
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
        {places.data && shown.length === 0 ? (
          tab === 'want' ? (
            <Empty emoji="🍜" title="还没有想去的店" hint="在小红书刷到好吃的？复制分享链接，来这里存一下" action={<Button title="收藏一家店" onPress={() => router.push('/place/edit')} />} />
          ) : (
            <Empty emoji="📸" title="还没有吃过的记录" hint="去过一家店之后，记下吃了什么、拍几张照片" />
          )
        ) : tab === 'visited' ? (
          <View style={{ gap: 14 }}>
            {shown.map((p, i) => (
              <VisitedCard key={p.id} p={p} i={i} cover={placeCover(p, visits.data)} count={visitCount(p.id)} />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {shown.map((p, i) => (
              <WantCard key={p.id} p={p} i={i} />
            ))}
          </View>
        )}
      </View>
      {tab === 'want' && shown.length > 1 && (
        <Animated.View entering={enter(shown.length)}>
          <PressScale onPress={() => router.push('/roulette')} style={styles.rouletteHint}>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>Can&apos;t decide?</Text>
            <Txt v="bodyStrong" color={colors.skyInk}>
              转一下 🎲
            </Txt>
          </PressScale>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderCurve: 'continuous', ...shadow },
  coverWrap: { height: 190, backgroundColor: colors.surfaceAlt },
  badge: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(31,26,23,0.6)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  wantCard: { backgroundColor: sectionTheme.eats.bg, borderRadius: radius.lg, padding: 16, minHeight: 150, justifyContent: 'space-between', borderCurve: 'continuous' },
  xhs: { backgroundColor: '#FF2442', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rouletteHint: { marginTop: 16, backgroundColor: colors.sky, borderRadius: radius.lg, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
