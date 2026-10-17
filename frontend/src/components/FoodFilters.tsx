import { Check, ChevronDown, LocateFixed, MapPin } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { categoryEmoji } from '@/lib/food';
import { categoryOptions, cityOptions, type FoodFilter, type FoodSort, RADII, sortLabel, whereLabel } from '@/lib/foodFilter';
import { haptic } from '@/lib/haptics';
import { useMyLocation } from '@/lib/location';
import type { Place } from '@/lib/types';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Sheet } from './Sheet';
import { PressScale, Row, Txt } from './ui';

function Pill({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: ReactNode }) {
  return (
    <PressScale scaleTo={0.94} onPress={onPress} style={[styles.pill, active && styles.pillOn]}>
      {icon}
      <Txt v="secondary" numberOfLines={1} style={{ fontWeight: '600', maxWidth: 120 }} color={active ? colors.white : colors.ink}>
        {label}
      </Txt>
      <ChevronDown size={14} color={active ? colors.white : colors.muted} />
    </PressScale>
  );
}

function Option({ label, hint, on, onPress, left }: { label: string; hint?: string | number; on: boolean; onPress: () => void; left?: ReactNode }) {
  return (
    <PressScale haptics={false} scaleTo={0.98} onPress={onPress} style={styles.option}>
      {left}
      <Txt v="body" style={{ flex: 1 }} color={on ? colors.ink : colors.inkSoft}>
        {label}
      </Txt>
      {hint != null && <Txt v="secondary">{hint}</Txt>}
      <View style={[styles.radio, on && styles.radioOn]}>{on && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
    </PressScale>
  );
}

/** 筛选条：在哪 / 类型 / 排序，点开是底部弹层 */
export function FoodFilters({ places, value, onChange, showSort = true, allowRating = false }: { places: Place[]; value: FoodFilter; onChange: (f: FoodFilter) => void; showSort?: boolean; allowRating?: boolean }) {
  const [open, setOpen] = useState<'where' | 'category' | 'sort' | null>(null);
  const { pos, locating, request } = useMyLocation();
  const cities = cityOptions(places);
  const cats = categoryOptions(places);

  const set = (patch: Partial<FoodFilter>) => {
    haptic.tick();
    onChange({ ...value, ...patch });
  };
  const needLocation = async (patch: Partial<FoodFilter>) => {
    if (pos || (await request())) set(patch);
    else toast('没拿到位置，检查一下浏览器的定位权限', '⚠️');
  };

  const sorts: FoodSort[] = ['recent', 'near', 'price', ...(allowRating ? (['rating'] as FoodSort[]) : [])];
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Pill label={whereLabel(value)} active={value.where !== 'all'} onPress={() => setOpen('where')} icon={<MapPin size={14} color={value.where !== 'all' ? colors.white : colors.inkSoft} />} />
        <Pill label={value.category ? `${categoryEmoji(value.category)} ${value.category}` : '全部类型'} active={!!value.category} onPress={() => setOpen('category')} />
        {showSort && <Pill label={sortLabel[value.where === 'near' && value.sort === 'recent' ? 'near' : value.sort]} active={value.sort !== 'recent'} onPress={() => setOpen('sort')} />}
      </ScrollView>

      <Sheet visible={open === 'where'} onClose={() => setOpen(null)} dragAnywhere={false}>
        <Txt v="heading">在哪吃</Txt>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.list}>
          <Option label="全部城市" hint={places.length} on={value.where === 'all'} onPress={() => (set({ where: 'all' }), setOpen(null))} />
          <Option
            label={locating ? '正在定位…' : '我附近'}
            on={value.where === 'near'}
            left={<LocateFixed size={18} color={colors.accentStrong} />}
            onPress={() => needLocation({ where: 'near', sort: value.sort === 'recent' ? 'near' : value.sort })}
          />
          {value.where === 'near' && (
            <Row gap={8} style={styles.radii}>
              {RADII.map((r) => (
                <PressScale key={r} scaleTo={0.92} onPress={() => set({ radius: r })} style={[styles.radius, value.radius === r && styles.radiusOn]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: value.radius === r ? colors.white : colors.inkSoft }}>{r}km</Text>
                </PressScale>
              ))}
            </Row>
          )}
          {cities.map(({ city, count }) => (
            <Option key={city} label={city} hint={count} on={value.where === `city:${city}`} onPress={() => (set({ where: `city:${city}` }), setOpen(null))} />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={open === 'category'} onClose={() => setOpen(null)} dragAnywhere={false}>
        <Txt v="heading">吃什么</Txt>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.list}>
          <Option label="全部类型" hint={places.length} on={!value.category} onPress={() => (set({ category: null }), setOpen(null))} />
          {cats.map(({ category, count }) => (
            <Option key={category} label={category} hint={count} left={<Text style={{ fontSize: 20 }}>{categoryEmoji(category)}</Text>} on={value.category === category} onPress={() => (set({ category }), setOpen(null))} />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={open === 'sort'} onClose={() => setOpen(null)}>
        <Txt v="heading">排序</Txt>
        <View style={styles.list}>
          {sorts.map((s) => (
            <Option
              key={s}
              label={sortLabel[s]}
              on={(value.where === 'near' && value.sort === 'recent' ? 'near' : value.sort) === s}
              onPress={() => {
                setOpen(null);
                if (s === 'near') needLocation({ sort: s });
                else set({ sort: s });
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  radii: { paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  radius: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  radiusOn: { backgroundColor: colors.accentStrong },
});
