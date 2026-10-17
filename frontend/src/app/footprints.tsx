import { router } from 'expo-router';
import { ChevronRight, MapPin, Navigation } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { Constellation, StarPoint } from '@/components/Constellation';
import { FootprintMap } from '@/components/FootprintMap';
import { RollingNumber, Segmented, StarRating } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { enter, PressScale, Row, Txt } from '@/components/ui';
import { categoryEmoji } from '@/lib/food';
import { AMAP_JS_KEY, openInMaps } from '@/lib/geo';
import type { MapPoint } from '@/lib/mapHtml';
import { invalidate, useQuery } from '@/lib/store';
import type { Place, Visit } from '@/lib/types';
import { colors, fonts, radius, shadow } from '@/theme';

type Filter = 'visited' | 'want' | 'all';
const MAP_H = 380;

function Stat({ value, label, text }: { value?: number; label: string; text?: string }) {
  return (
    <View style={styles.stat}>
      {text !== undefined ? (
        <Text style={styles.statText} numberOfLines={1}>
          {text}
        </Text>
      ) : (
        <RollingNumber value={value ?? 0} style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink }} />
      )}
      <Txt v="caption">{label}</Txt>
    </View>
  );
}

export default function Footprints() {
  const places = useQuery<Place[]>('/api/places');
  const visits = useQuery<Visit[]>('/api/visits');
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>('visited');
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // 每家店第一次去的日期，用来给足迹连线排序
  const firstVisit = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of visits.data ?? []) if (!m.has(v.placeId) || v.date < m.get(v.placeId)!) m.set(v.placeId, v.date);
    return m;
  }, [visits.data]);

  const shown = useMemo(
    () =>
      (places.data ?? [])
        .filter((p) => filter === 'all' || p.status === filter)
        .sort((a, b) => (firstVisit.get(a.id) ?? a.createdAt).localeCompare(firstVisit.get(b.id) ?? b.createdAt)),
    [places.data, filter, firstVisit]
  );
  const located = shown.filter((p) => p.lat != null && p.lng != null);
  const missing = shown.length - located.length;

  const mapPoints = useMemo<MapPoint[]>(
    () => located.map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, status: p.status, emoji: categoryEmoji(p.category) })),
    [located]
  );
  const starPoints = useMemo<StarPoint[]>(() => located.map((p) => ({ id: p.id, name: p.name, lat: p.lat!, lng: p.lng!, visited: p.status === 'visited' })), [located]);

  const visited = (places.data ?? []).filter((p) => p.status === 'visited');
  const cities = new Set(visited.map((p) => p.city).filter(Boolean)).size;
  const topCategory = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of visited) if (p.category) count.set(p.category, (count.get(p.category) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [visited]);

  const groups = useMemo(() => {
    const m = new Map<string, Place[]>();
    for (const p of shown) {
      const c = p.city || '其他';
      m.set(c, [...(m.get(c) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);

  const sel = located.find((p) => p.id === selected);
  const visitCount = (id: string) => visits.data?.filter((v) => v.placeId === id).length ?? 0;
  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const useMap = !!AMAP_JS_KEY && !mapError;
  const mapW = width - 32;

  return (
    <Screen
      back
      title="足迹"
     
      onRefresh={async () => {
        invalidate('places');
        invalidate('visits');
      }}>
      <Animated.View entering={enter(0)} style={styles.stats}>
        <Stat value={visited.length} label="家店吃过" />
        <Stat value={cities} label="座城市" />
        <Stat value={visits.data?.length ?? 0} label="次打卡" />
        <Stat text={topCategory ? `${categoryEmoji(topCategory)}` : '—'} label={topCategory ? `最爱${topCategory}` : '最爱'} />
      </Animated.View>

      <Animated.View entering={enter(1)} style={{ marginTop: 14 }}>
        <Segmented
          options={[
            { key: 'visited', label: '吃过' },
            { key: 'want', label: '想去' },
            { key: 'all', label: '全部' },
          ]}
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setSelected(null);
          }}
        />
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.mapCard}>
        {useMap ? (
          <FootprintMap points={mapPoints} focusId={focusId} onSelect={onSelect} onError={setMapError} />
        ) : (
          <Constellation points={starPoints} width={mapW} height={MAP_H} selectedId={selected} onSelect={onSelect} />
        )}
        {located.length === 0 && (
          <View pointerEvents="none" style={styles.mapEmpty}>
            <Txt v="bodyStrong" color={useMap ? colors.ink : colors.white}>
              还没有带位置的店
            </Txt>
          </View>
        )}
        {!useMap && located.length > 0 && (
          <View pointerEvents="none" style={styles.caption}>
            <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, color: 'rgba(255,255,255,0.85)' }}>our little constellation</Text>
          </View>
        )}
      </Animated.View>

      {/* 选中的店 */}
      {sel && (
        <Animated.View key={sel.id} entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(150)} style={styles.selCard}>
          <Text style={{ fontSize: 30 }}>{categoryEmoji(sel.category)}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="bodyStrong" numberOfLines={1}>
              {sel.name}
            </Txt>
            <Row gap={6}>
              {sel.rating ? <StarRating value={sel.rating} size={12} /> : null}
              <Txt v="caption" numberOfLines={1}>
                {[sel.category, sel.status === 'visited' ? `去过 ${visitCount(sel.id)} 次` : '想去'].filter(Boolean).join(' · ')}
              </Txt>
            </Row>
          </View>
          <PressScale onPress={() => openInMaps(sel)} style={styles.selBtn}>
            <Navigation size={16} color={colors.ink} />
          </PressScale>
          <PressScale onPress={() => router.push({ pathname: '/place/[id]', params: { id: sel.id } })} style={[styles.selBtn, { backgroundColor: colors.ink }]}>
            <ChevronRight size={18} color={colors.white} />
          </PressScale>
        </Animated.View>
      )}

      {missing > 0 && (
        <Row gap={6} style={{ marginTop: 12, paddingHorizontal: 4 }}>
          <MapPin size={13} color={colors.muted} />
          <Txt v="caption">{missing} 家店没有位置</Txt>
        </Row>
      )}

      <Txt v="label" style={{ marginTop: 24, marginBottom: 10, marginLeft: 4 }}>
        按城市
      </Txt>
      <View style={{ gap: 12 }}>
        {groups.map(([city, list], gi) => (
          <Animated.View key={city} entering={enter(gi + 3)} layout={LinearTransition.springify().damping(18)} style={styles.cityCard}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Txt v="heading">{city}</Txt>
              <Txt v="caption">{list.length} 家</Txt>
            </Row>
            {list.map((p) => (
              <PressScale
                key={p.id}
                haptics={false}
                onPress={() => {
                  if (p.lat == null) return router.push({ pathname: '/place/[id]', params: { id: p.id } });
                  setSelected(p.id);
                  setFocusId(p.id);
                }}
                style={styles.placeRow}>
                <Text style={{ fontSize: 20 }}>{categoryEmoji(p.category)}</Text>
                <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>
                  {p.name}
                </Txt>
                {p.status === 'visited' ? <Txt v="caption">{visitCount(p.id)} 次</Txt> : <Txt v="caption">想去</Txt>}
              </PressScale>
            ))}
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 16, ...shadow },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statText: { fontSize: 30, lineHeight: 44 },
  mapCard: { height: MAP_H, borderRadius: radius.xl, overflow: 'hidden', marginTop: 14, backgroundColor: colors.surfaceAlt, borderCurve: 'continuous' },
  mapEmpty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 4 },
  caption: { position: 'absolute', left: 18, bottom: 14 },
  selCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginTop: 12, ...shadow },
  selBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cityCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
});
