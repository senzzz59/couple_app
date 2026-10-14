import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardPaste, LocateFixed, MapPin, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Segmented, StarRating, toast } from '@/components/motion';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetScreen } from '@/components/Screen';
import { Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { CATEGORIES, categoryEmoji } from '@/lib/food';
import { AMAP_KEY, currentPosition, parseXhsShare, Poi, searchPoi } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { invalidate, useQuery } from '@/lib/store';
import type { Place, PlaceStatus } from '@/lib/types';
import { colors, radius } from '@/theme';

export default function EditPlace() {
  const params = useLocalSearchParams<{ id?: string; status?: PlaceStatus }>();
  const existing = useQuery<Place>(params.id ? `/api/places/${params.id}` : null);
  // 编辑时等数据到了再挂载表单，表单直接用它做初始值
  if (params.id && !existing.data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <PlaceForm params={params} initial={existing.data} />;
}

function PlaceForm({ params, initial: p }: { params: { id?: string; status?: PlaceStatus }; initial?: Place }) {
  const [f, setF] = useState({
    name: p?.name ?? '',
    status: p?.status ?? params.status ?? 'want',
    category: p?.category ?? '',
    price: p?.price ? String(p.price) : '',
    rating: p?.rating ?? 0,
    address: p?.address ?? '',
    city: p?.city ?? '',
    lat: p?.lat ?? null,
    lng: p?.lng ?? null,
    xhsUrl: p?.xhsUrl ?? '',
    note: p?.note ?? '',
  });
  const [cover, setCover] = useState<PhotoItem[]>(p?.cover ? [{ remote: p.cover }] : []);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [poiResults, setPois] = useState<Poi[]>([]);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  // 高德搜索：输入店名时自动联想（已经选定位置后就不再提示）
  const searching = !!AMAP_KEY && f.name.trim().length >= 2 && f.lat == null;
  const pois = searching ? poiResults : [];
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(() => searchPoi(f.name, f.city).then(setPois).catch(() => setPois([])), 400);
    return () => clearTimeout(t);
  }, [searching, f.name, f.city]);

  const pasteXhs = async () => {
    const text = await Clipboard.getStringAsync();
    const { url, title } = parseXhsShare(text ?? '');
    if (!url) return toast('剪贴板里没有找到链接', '🤔', '在小红书点「分享 → 复制链接」再来');
    haptic.success();
    set({ xhsUrl: url, note: f.note || title || '' });
    toast('已粘贴小红书链接', '📕');
  };

  const locate = async () => {
    setLocating(true);
    try {
      const pos = await currentPosition();
      set({ lat: pos.lat, lng: pos.lng, address: f.address || pos.address, city: f.city || pos.city });
      haptic.success();
    } catch (e) {
      toast((e as Error).message, '📍');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!f.name.trim()) return toast('店名还没填', '✏️');
    setSaving(true);
    try {
      const newCover = cover[0]?.local ? (await uploadImages([cover[0].local]))[0] : (cover[0]?.remote ?? null);
      const body = {
        name: f.name.trim(),
        status: f.status,
        category: f.category || null,
        price: f.price ? Math.round(Number(f.price)) || null : null,
        rating: f.status === 'visited' && f.rating ? f.rating : null,
        address: f.address || null,
        city: f.city || null,
        lat: f.lat,
        lng: f.lng,
        xhsUrl: f.xhsUrl || null,
        note: f.note || null,
        cover: newCover,
      };
      const saved = params.id ? await api.patch<Place>(`/api/places/${params.id}`, body) : await api.post<Place>('/api/places', body);
      haptic.success();
      invalidate('places');
      if (params.id) router.back();
      else router.replace({ pathname: '/place/[id]', params: { id: saved.id } });
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm('删除这家店？', '这家店的所有探店记录和照片也会一起删除'))) return;
    await api.del(`/api/places/${params.id}`);
    invalidate('places');
    invalidate('visits');
    router.dismissTo('/eats');
  };

  return (
    <SheetScreen title={params.id ? '编辑' : '收藏一家店'} action={<Button title="保存" onPress={save} loading={saving} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <Animated.View entering={FadeInDown.springify().damping(18)}>
        <PressScale onPress={pasteXhs} style={styles.xhsCard}>
          <View style={styles.xhsLogo}>
            <Txt style={{ fontWeight: '900', fontSize: 13 }} color={colors.white}>
              小红书
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="bodyStrong">{f.xhsUrl ? '已关联小红书笔记' : '从小红书粘贴'}</Txt>
            <Txt v="caption" numberOfLines={1}>
              {f.xhsUrl || '先在小红书里「分享 → 复制链接」'}
            </Txt>
          </View>
          <ClipboardPaste size={20} color={colors.muted} />
        </PressScale>
      </Animated.View>

      <Segmented
        options={[
          { key: 'want', label: '🔖 想去' },
          { key: 'visited', label: '✅ 吃过' },
        ]}
        value={f.status}
        onChange={(status) => set({ status })}
      />

      <View>
        <Field label="店名" value={f.name} onChangeText={(name) => set({ name, lat: f.lat && name !== f.name ? null : f.lat })} placeholder={AMAP_KEY ? '输入店名，自动搜索' : '例如：湊湊火锅'} />
        {pois.length > 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.pois}>
            {pois.slice(0, 6).map((p) => (
              <Pressable
                key={`${p.name}${p.lat}`}
                style={styles.poi}
                onPress={() => {
                  haptic.tick();
                  set({ name: p.name, address: p.address, city: p.city, lat: p.lat, lng: p.lng, category: f.category || (CATEGORIES.includes(p.category) ? p.category : '') });
                  setPois([]);
                }}>
                <Search size={14} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </Txt>
                  <Txt v="caption" numberOfLines={1}>
                    {p.city} {p.address}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}
      </View>

      <View>
        <Txt v="label" style={{ marginBottom: 8, marginLeft: 4 }}>
          类型
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={`${categoryEmoji(c)} ${c}`} active={f.category === c} onPress={() => set({ category: f.category === c ? '' : c })} />
          ))}
        </View>
      </View>

      {f.status === 'visited' && (
        <Animated.View entering={FadeInDown.springify()} style={{ gap: 8 }}>
          <Txt v="label" style={{ marginLeft: 4 }}>
            总体评分
          </Txt>
          <StarRating value={f.rating} onChange={(rating) => set({ rating })} size={32} />
        </Animated.View>
      )}

      <Field label="人均（元）" value={f.price} onChangeText={(price) => set({ price: price.replace(/[^\d]/g, '') })} keyboardType="number-pad" placeholder="例如 150" />

      <View style={{ gap: 8 }}>
        <Field label="地址" value={f.address} onChangeText={(address) => set({ address })} placeholder="街道、商场、楼层" />
        <Row>
          <PressScale onPress={locate} style={styles.locate}>
            {locating ? <ActivityIndicator size="small" color={colors.ink} /> : <LocateFixed size={16} color={colors.ink} />}
            <Txt v="caption" color={colors.ink} style={{ fontWeight: '600' }}>
              用我现在的位置
            </Txt>
          </PressScale>
          {f.lat != null && (
            <Animated.View entering={FadeIn}>
              <Row gap={4}>
                <MapPin size={14} color={colors.sageInk} />
                <Txt v="caption" color={colors.sageInk}>
                  已定位，可以一键导航
                </Txt>
              </Row>
            </Animated.View>
          )}
        </Row>
      </View>

      <Field label="备注" value={f.note} onChangeText={(note) => set({ note })} placeholder="想点什么菜、要不要排队、适合什么场合…" multiline />
      {f.xhsUrl ? <Field label="小红书链接" value={f.xhsUrl} onChangeText={(xhsUrl) => set({ xhsUrl })} autoCapitalize="none" /> : null}

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          封面（可选，不选就用探店照片）
        </Txt>
        <PhotoPicker value={cover} onChange={setCover} max={1} size={120} />
      </View>

      {params.id && <Button title="删除这家店" variant="ghost" onPress={remove} />}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  xhsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#FFD6DC' },
  xhsLogo: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  pois: { marginTop: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  poi: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
});
