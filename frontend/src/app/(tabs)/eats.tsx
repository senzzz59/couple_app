import { router } from 'expo-router';
import { Dices, Map as MapIcon, MapPin, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { FoodFilters } from '@/components/FoodFilters';
import { Segmented, StarRating } from '@/components/motion';
import { VisitStamp } from '@/components/VisitStamp';
import { PlaceArt, PlacePolaroid } from '@/components/PlacePolaroid';
import { PlacePeek } from '@/components/PlacePeek';
import { Screen } from '@/components/Screen';
import { QueryFallback } from '@/components/Skeleton';
import { Button, Empty, IconButton, listItem, PressScale, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { placeArea, placeImage } from '@/lib/food';
import { applyFoodFilter, DEFAULT_FILTER, type FilteredPlace, type FoodFilter } from '@/lib/foodFilter';
import { haptic } from '@/lib/haptics';
import { fmtKm, useMyLocation } from '@/lib/location';
import { invalidate, useQuery } from '@/lib/store';
import type { Place, PlaceStatus, Visit } from '@/lib/types';
import { colors, radius, shadow } from '@/theme';

const open = (p: Place) => router.push({ pathname: '/place/[id]', params: { id: p.id } });

function VisitedCard({ p, visits, count, i, onPeek }: { p: FilteredPlace; visits: Visit[]; count: number; i: number; onPeek: () => void }) {
  const where = [p.km != null ? fmtKm(p.km) : null, placeArea(p) ?? p.city, p.address].filter(Boolean).join(' · ');
  return (
    <Animated.View {...listItem(i, 150)}>
      <PressScale
        onPress={() => open(p)}
        onLongPress={() => {
          haptic.medium();
          onPeek();
        }}
        delayLongPress={350}
        style={styles.bigCard}>
        <View style={styles.coverWrap}>
          <PlaceArt p={p} image={placeImage(p, visits)} emojiSize={110} thumb={false} />
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
          {!!where && (
            <Row gap={4}>
              <MapPin size={12} color={colors.muted} />
              <Txt v="caption" numberOfLines={1} style={{ flex: 1 }}>
                {where}
              </Txt>
            </Row>
          )}
        </View>
      </PressScale>
    </Animated.View>
  );
}

// 每次打开 App 顺手给关联了高德、还没有照片的店补一张高德照片
let backfilled = false;
function useAmapPhotoBackfill(places: Place[] | undefined) {
  useEffect(() => {
    if (backfilled || !places?.some((p) => p.amapUrl && p.amapPhoto === null)) return;
    backfilled = true;
    api
      .post<{ checked: number; updated: number }>('/api/places/amap-photos')
      .then((r) => {
        if (r.updated) invalidate('places');
      })
      .catch(() => {});
  }, [places]);
}

export default function Eats() {
  const places = useQuery<Place[]>('/api/places');
  const visits = useQuery<Visit[]>('/api/visits');
  const [tab, setTab] = useState<PlaceStatus>('want');
  const [filters, setFilters] = useState<Record<PlaceStatus, FoodFilter>>({ want: DEFAULT_FILTER, visited: DEFAULT_FILTER });
  const [peek, setPeek] = useState<FilteredPlace | null>(null);
  const { pos } = useMyLocation();
  useAmapPhotoBackfill(places.data);

  const filter = filters[tab];
  const list = useMemo(() => (places.data ?? []).filter((p) => p.status === tab), [places.data, tab]);
  const shown = useMemo(() => applyFoodFilter(list, filter, pos, visits.data), [list, filter, pos, visits.data]);
  const query = filter.query?.trim() ?? '';
  const filtered = filter.where !== 'all' || !!filter.category || !!query;
  const visitCount = (id: string) => visits.data?.filter((v) => v.placeId === id).length ?? 0;
  const { width } = useWindowDimensions();
  const polW = Math.floor((Math.min(width, 720) - 32 - 16) / 2);

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
          <IconButton icon={MapIcon} label="足迹地图" onPress={() => router.push('/footprints')} />
          <IconButton icon={Dices} label="今天吃什么" onPress={() => router.push('/roulette')} bg={colors.sky} color={colors.skyInk} />
          <IconButton icon={Plus} label="收藏一家店" onPress={() => router.push({ pathname: '/place/edit', params: { status: tab } })} />
        </Row>
      }>
      <Segmented
        options={[
          { key: 'want', label: `想去 ${places.data?.filter((p) => p.status === 'want').length ?? ''}` },
          { key: 'visited', label: `吃过 ${places.data?.filter((p) => p.status === 'visited').length ?? ''}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {list.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <FoodFilters key={tab} places={list} value={filter} onChange={(f) => setFilters((s) => ({ ...s, [tab]: f }))} allowRating={tab === 'visited'} searchable />
        </View>
      )}

      <View style={{ marginTop: tab === 'want' ? 22 : 16 }}>
        <QueryFallback q={places} kind={tab === 'want' ? 'grid' : 'cover'} count={tab === 'want' ? 4 : 2} />
        {places.data && list.length === 0 ? (
          tab === 'want' ? (
            <Empty emoji="🍜" title="还没有想去的店" hint="复制小红书或高德的分享链接就能存" action={<Button title="收藏一家店" onPress={() => router.push('/place/edit')} />} />
          ) : (
            <Empty emoji="📸" title="还没有吃过的记录" />
          )
        ) : places.data && shown.length === 0 && filtered ? (
          <Empty
            emoji="🔍"
            title={query ? `没找到「${query}」` : filter.where === 'near' ? `${filter.radius}km 内没有` : '这里还没有'}
            hint={query ? '可以搜店名、地址、类型，或者吃过的菜' : filter.where === 'near' ? '换大一点的范围试试' : undefined}
            action={<Button title={query ? '清除搜索和筛选' : '看全部'} variant="secondary" onPress={() => setFilters((s) => ({ ...s, [tab]: DEFAULT_FILTER }))} />}
          />
        ) : tab === 'visited' ? (
          <View style={{ gap: 14 }}>
            {shown.map((p, i) => (
              <VisitedCard key={p.id} p={p} i={i} visits={visits.data ?? []} count={visitCount(p.id)} onPeek={() => setPeek(p)} />
            ))}
          </View>
        ) : (
          <View style={styles.wall}>
            {shown.map((p, i) => (
              <Animated.View key={p.id} {...listItem(i, 150)}>
                <PlacePolaroid p={p} image={placeImage(p, visits.data)} km={p.km} width={polW} onPress={() => open(p)} onLongPress={() => setPeek(p)} />
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      <PlacePeek place={peek} km={peek?.km} visits={visits.data ?? []} onClose={() => setPeek(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wall: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 26 },
  bigCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderCurve: 'continuous', ...shadow },
  coverWrap: { height: 190, backgroundColor: colors.surfaceAlt },
});
