import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardPaste, LocateFixed, MapPin, Navigation, Search, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Segmented, StarRating, toast } from '@/components/motion';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetScreen } from '@/components/Screen';
import { Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { amapShareUrl } from '@/lib/amap';
import { confirm } from '@/lib/confirm';
import { CATEGORIES, categoryEmoji } from '@/lib/food';
import { AMAP_KEY, currentPosition, parseXhsShare, Poi, searchPoi } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
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
  const preferences = useQuery<{ categories: string[] | null }>('/api/food-categories');
  const categories = preferences.data?.categories ?? CATEGORIES;
  const [managing, setManaging] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
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
    amapUrl: p?.amapUrl ?? '',
    note: p?.note ?? '',
  });
  const [cover, setCover] = useState<PhotoItem[]>(p?.cover ? [{ remote: p.cover }] : []);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedUrl, setImportedUrl] = useState(p?.amapUrl ?? '');
  const [poiResults, setPois] = useState<Poi[]>([]);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  // 高德搜索：输入店名时自动联想（已经选定位置后就不再提示）
  const searching = !!AMAP_KEY && f.name.trim().length >= 2 && f.lat == null && !f.amapUrl;
  const pois = searching ? poiResults : [];
  useEffect(() => {
    if (!searching) return;
    let active = true;
    const t = setTimeout(() => searchPoi(f.name, f.city).then((results) => { if (active) setPois(results); }).catch(() => { if (active) setPois([]); }), 400);
    return () => { active = false; clearTimeout(t); };
  }, [searching, f.name, f.city]);

  const readAmap = async (text: string) => {
    const url = amapShareUrl(text);
    if (!url) throw new Error('没有找到高德链接，请在高德地点页点「分享 → 复制链接」');
    const result = await api.post<{ price: number | null; amapUrl: string; location: { name: string; address: string; lat: number; lng: number } | null }>('/api/amap/resolve', { url, shareText: text.slice(0, 10000) });
    setImportedUrl(result.amapUrl);
    return {
      amapUrl: result.amapUrl,
      ...(result.price != null ? { price: String(result.price) } : {}),
      lat: result.location?.lat ?? null,
      lng: result.location?.lng ?? null,
      ...(result.location?.name ? { name: result.location.name } : {}),
      ...(result.location?.address ? { address: result.location.address, city: '' } : {}),
    };
  };

  const pasteAmap = async () => {
    setImporting(true);
    try {
      const patch = await readAmap(await Clipboard.getStringAsync());
      set(patch);
      setPois([]);
      haptic.success();
      toast(patch.lat != null ? '已读取高德地点，保存后即可导航' : '已关联高德链接，保存后可打开原地点', '📍');
    } catch (e) {
      toast((e as Error).message, '📍');
    } finally {
      setImporting(false);
    }
  };

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
      set({ amapUrl: '', lat: pos.lat, lng: pos.lng, address: f.address || pos.address, city: f.city || pos.city });
      haptic.success();
    } catch (e) {
      toast((e as Error).message, '📍');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const form = f.amapUrl && f.amapUrl !== importedUrl ? { ...f, ...await readAmap(f.amapUrl) } : f;
      set(form);
      if (!form.name.trim()) return toast('店名还没填', '✏️');
      const newCover = cover[0]?.local ? (await uploadImages([cover[0].local]))[0] : (cover[0]?.remote ?? null);
      const body = {
        name: form.name.trim(),
        status: f.status,
        category: f.category || null,
        price: form.price ? Math.round(Number(form.price)) || null : null,
        rating: f.status === 'visited' && f.rating ? f.rating : null,
        address: form.address || null,
        city: form.city || null,
        lat: form.lat,
        lng: form.lng,
        amapUrl: form.amapUrl || null,
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

  const updateCategories = async (next: string[]) => {
    setCategorySaving(true);
    try {
      const result = await api.put<{ categories: string[] }>('/api/food-categories', { categories: next });
      setQueryData('/api/food-categories', () => result);
      setNewCategory('');
      return true;
    } catch (e) { toast((e as Error).message, '⚠️'); return false; }
    finally { setCategorySaving(false); }
  };

  const addCategory = async () => {
    if (categorySaving || !preferences.data) return;
    const name = newCategory.trim();
    if (!name) return;
    if (categories.includes(name)) return toast('这个类型已经有了', '🍽️');
    if (await updateCategories([...categories, name])) set({ category: name });
  };

  const remove = async () => {
    if (!(await confirm('删除这家店？', '这家店的所有探店记录和照片也会一起删除'))) return;
    await api.del(`/api/places/${params.id}`);
    invalidate('places');
    invalidate('visits');
    router.dismissTo('/eats');
  };

  return (
    <SheetScreen title={params.id ? '编辑' : '收藏一家店'} action={<Button title="保存" onPress={save} loading={saving} disabled={importing || locating} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <View style={styles.amapCard}>
        <Row gap={10}>
          <Navigation size={22} color={colors.sageInk} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="bodyStrong">收藏高德地点</Txt>
            <Txt v="caption">在高德找到这家店，点「分享 → 复制链接」，回来粘贴</Txt>
          </View>
        </Row>
        <Button title={f.amapUrl ? '粘贴另一处高德地点' : '粘贴高德地点链接'} icon={ClipboardPaste} onPress={pasteAmap} loading={importing} disabled={saving || locating} />
        <Field
          label="高德链接"
          value={f.amapUrl}
          editable={!importing && !saving && !locating}
          onChangeText={(amapUrl) => set({ amapUrl, lat: null, lng: null })}
          placeholder="也可以在这里粘贴高德分享链接或文案"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!f.amapUrl && (
          <Row style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Txt v="caption" color={colors.sageInk}>
              {f.amapUrl !== importedUrl ? '保存时会读取地点信息' : f.lat != null && f.lng != null ? '已关联高德位置，可一键导航' : '已关联分享链接，可打开高德原地点'}
            </Txt>
            <PressScale disabled={importing || saving || locating} onPress={() => { set({ amapUrl: '', lat: null, lng: null }); setImportedUrl(''); }}>
              <Txt v="caption">移除链接</Txt>
            </PressScale>
          </Row>
        )}
      </View>
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
        <Field label="店名" value={f.name} editable={!importing && !saving} onChangeText={(name) => set({ name })} placeholder={AMAP_KEY ? '输入店名，自动搜索' : '例如：湊湊火锅'} />
        {pois.length > 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.pois}>
            {pois.slice(0, 6).map((p) => (
              <Pressable
                key={`${p.name}${p.lat}`}
                style={styles.poi}
                onPress={() => {
                  haptic.tick();
                  set({ amapUrl: '', name: p.name, address: p.address, city: p.city, lat: p.lat, lng: p.lng, price: p.price != null ? String(p.price) : f.price, category: f.category || (categories.includes(p.category) ? p.category : '') });
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
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Txt v="label">类型</Txt>
          <PressScale accessibilityLabel={managing ? '完成类型管理' : '管理我的类型'} onPress={() => setManaging(!managing)}>
            <Txt v="caption" color={colors.sageInk}>{managing ? '完成' : '管理'}</Txt>
          </PressScale>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[...new Set([...categories, ...(f.category && !categories.includes(f.category) ? [f.category] : [])])].map((c) => (
            <Row key={c} gap={2}>
              <Chip label={`${categoryEmoji(c)} ${c}`} active={f.category === c} onPress={() => set({ category: f.category === c ? '' : c })} />
              {managing && categories.includes(c) && <PressScale accessibilityLabel={`删除类型${c}`} disabled={categorySaving || !preferences.data} onPress={async () => {
                if (await updateCategories(categories.filter((name) => name !== c))) {
                  if (f.category === c) set({ category: '' });
                }
              }} style={{ padding: 8, minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><X size={14} color={colors.muted} /></PressScale>}
            </Row>
          ))}
          {!managing && <Chip label="＋ 添加" onPress={() => setManaging(true)} />}
        </View>
        {managing && <View style={{ marginTop: 12, gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface }}>
          <Txt v="caption">我的类型 · 仅自己可见，删除不会影响已收藏的店铺</Txt>
          {preferences.error && <PressScale onPress={preferences.refresh}><Txt v="caption">加载失败，点此重试</Txt></PressScale>}
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field value={newCategory} onChangeText={setNewCategory} maxLength={20} placeholder="例如：私房菜" onSubmitEditing={addCategory} /></View>
            <Button title="添加" icon={Plus} onPress={addCategory} loading={categorySaving} disabled={!newCategory.trim() || !preferences.data} />
          </Row>
        </View>}
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
        <Field label="地址" value={f.address} editable={!importing && !saving} onChangeText={(address) => set({ address })} placeholder="街道、商场、楼层" />
        <Row>
          <PressScale onPress={locate} disabled={locating || importing || saving} style={styles.locate}>
            {locating ? <ActivityIndicator size="small" color={colors.ink} /> : <LocateFixed size={16} color={colors.ink} />}
            <Txt v="caption" color={colors.ink} style={{ fontWeight: '600' }}>
              我就在店里，使用当前位置
            </Txt>
          </PressScale>
          {f.lat != null && f.lng != null && (
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
  amapCard: { gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  xhsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#FFD6DC' },
  xhsLogo: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#FF2442', alignItems: 'center', justifyContent: 'center' },
  pois: { marginTop: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  poi: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
});
