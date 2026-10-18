import { Check, ChevronDown, LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { ReactNode, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

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

/**
 * 搜索：平时是筛选条最前面的一个小圆钮；点一下就地展开成输入框（其它筛选先让开），
 * 搜过之后收起成一个显示关键词的小胶囊，点 × 清掉。
 * 小圆钮本身就是输入框：手指点到的就是输入框，iPhone 上键盘才会立刻弹出来（代码里再去聚焦，Safari 不给弹）。
 */
function SearchField({ query, onChange, focused, onFocusChange }: { query: string; onChange: (q: string) => void; focused: boolean; onFocusChange: (f: boolean) => void }) {
  const input = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasQuery = !!query.trim();
  const state = focused ? 'open' : hasQuery ? 'chip' : 'dot';
  const ink = state === 'chip' ? colors.white : colors.inkSoft;
  return (
    <Animated.View layout={LinearTransition.duration(180)} style={[styles.pill, styles.search, state === 'open' && styles.searchOpen, state === 'chip' && styles.pillOn, state === 'dot' && styles.searchDot]}>
      <Search size={state === 'chip' ? 14 : 16} color={ink} strokeWidth={2.4} pointerEvents="none" />
      <TextInput
        ref={input}
        value={query}
        onChangeText={onChange}
        placeholder={state === 'open' ? '店名、地址、吃过的菜…' : ''}
        placeholderTextColor={colors.faint}
        returnKeyType="search"
        accessibilityLabel="搜索"
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          onFocusChange(true);
        }}
        // 稍等一下再收起：点 × 时先失焦，马上收起的话 × 就点不到了
        onBlur={() => (blurTimer.current = setTimeout(() => onFocusChange(false), 150))}
        onSubmitEditing={() => input.current?.blur()}
        style={[styles.searchInput, state !== 'open' && styles.searchInputHidden]}
      />
      {state === 'chip' && (
        <Txt v="secondary" numberOfLines={1} pointerEvents="none" style={{ fontWeight: '600', maxWidth: 110 }} color={colors.white}>
          {query.trim()}
        </Txt>
      )}
      {state !== 'dot' && hasQuery && (
        <Pressable
          hitSlop={10}
          accessibilityLabel="清除搜索"
          onPress={() => {
            onChange('');
            if (focused) input.current?.focus();
          }}
          style={state === 'open' ? styles.clear : styles.chipClear}>
          <X size={state === 'open' ? 12 : 14} color={colors.white} strokeWidth={state === 'open' ? 3 : 2.6} />
        </Pressable>
      )}
    </Animated.View>
  );
}

/** 筛选条：搜索 / 在哪 / 类型 / 排序，点开是底部弹层 */
export function FoodFilters({ places, value, onChange, showSort = true, allowRating = false, searchable = false }: { places: Place[]; value: FoodFilter; onChange: (f: FoodFilter) => void; showSort?: boolean; allowRating?: boolean; searchable?: boolean }) {
  const [open, setOpen] = useState<'where' | 'category' | 'sort' | null>(null);
  const [searching, setSearching] = useState(false);
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
  const pills = (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={searchable ? { flex: 1, marginRight: -16 } : { marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingLeft: searchable ? 0 : 16, paddingRight: 16 }}>
        <Pill label={whereLabel(value)} active={value.where !== 'all'} onPress={() => setOpen('where')} icon={<MapPin size={14} color={value.where !== 'all' ? colors.white : colors.inkSoft} />} />
        <Pill label={value.category ? `${categoryEmoji(value.category)} ${value.category}` : '全部类型'} active={!!value.category} onPress={() => setOpen('category')} />
        {showSort && <Pill label={sortLabel[value.where === 'near' && value.sort === 'recent' ? 'near' : value.sort]} active={value.sort !== 'recent'} onPress={() => setOpen('sort')} />}
      </ScrollView>
  );

  return (
    <>
      {searchable ? (
        // 输入框一直挂在同一个位置，展开 / 收起不会重建它（否则会丢焦点）
        <View style={styles.bar}>
          <SearchField query={value.query ?? ''} onChange={(q) => onChange({ ...value, query: q })} focused={searching} onFocusChange={setSearching} />
          {searching ? (
            <Animated.View entering={FadeIn.duration(160)}>
              <Pressable hitSlop={8} onPress={() => setSearching(false)}>
                <Txt v="bodyStrong" style={{ fontSize: 15 }} color={colors.accentStrong}>
                  完成
                </Txt>
              </Pressable>
            </Animated.View>
          ) : (
            pills
          )}
        </View>
      ) : (
        pills
      )}

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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { overflow: 'hidden', gap: 6 },
  searchDot: { width: 36, paddingHorizontal: 0, justifyContent: 'center' },
  searchOpen: { flex: 1, paddingLeft: 12, paddingRight: 8, marginRight: 4 },
  // 16px：iPhone Safari 输入框字号小于 16px 时，获得焦点会把整页放大；网页上去掉浏览器默认的聚焦描边
  searchInput: { flex: 1, height: 36, fontSize: 16, color: colors.ink, paddingVertical: 0, minWidth: 0, outlineStyle: 'none' } as never,
  // 收起时输入框透明地铺满整个小圆钮 / 小胶囊，点到哪都是在点输入框（字号保持 16，免得 iPhone 放大页面）
  searchInputHidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', opacity: 0.02 } as never,
  chipClear: { zIndex: 1 },
  clear: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  radii: { paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  radius: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  radiusOn: { backgroundColor: colors.accentStrong },
});
