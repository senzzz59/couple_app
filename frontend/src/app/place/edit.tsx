import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardPaste, LocateFixed, MapPin, Search, Plus, X, ChevronRight, ChevronDown, Link2, Heart, Check, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { StarRating, toast } from '@/components/motion';
import { LivePlaceInfo } from '@/components/LivePlaceInfo';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetScreen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, Field, PressScale, Row, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { amapShareUrl } from '@/lib/amap';
import { confirm } from '@/lib/confirm';
import { CATEGORIES, categoryEmoji } from '@/lib/food';
import { AMAP_KEY, currentPosition, parseXhsShare } from '@/lib/geo';
import { type AmapPlace, poiUrl } from '@/lib/amapLive';
import { haptic } from '@/lib/haptics';
import { invalidate, setQueryData, useQuery } from '@/lib/store';
import type { Place, PlaceStatus } from '@/lib/types';
import { colors, fonts, radius } from '@/theme';

export default function EditPlace() {
  const params = useLocalSearchParams<{ id?: string; status?: PlaceStatus }>();
  const existing = useQuery<Place>(params.id ? `/api/places/${params.id}` : null);
  // 编辑时等数据到了再挂载表单，表单直接用它做初始值
  if (params.id && !existing.data) return <SheetScreen title="编辑这家店">{existing.error ? <View style={{ gap: 12 }}><Txt v="caption">店铺暂时没有加载出来</Txt><Button title="重新加载" onPress={existing.refresh} /></View> : <ActivityIndicator color={colors.accentStrong} />}</SheetScreen>;
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
  const [searchState, setSearchState] = useState<{ key: string; places: AmapPlace[]; message: string }>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  // Explicit search results let the user choose the right branch; never guess a same-name POI.
  const query = f.name.trim();
  const searchEnabled = query.length >= 2 && !f.amapUrl && f.lat == null;
  const searchKey = `${query}:${f.city}`;
  useEffect(() => {
    if (!searchEnabled) return;
    let active = true;
    const t = setTimeout(() => api.post<{ places: AmapPlace[]; message?: string }>('/api/amap/search', { query: query.slice(0, 80), city: f.city, key: AMAP_KEY })
      .then((result) => { if (active) setSearchState({ key: searchKey, places: result.places, message: result.message || (!result.places.length ? '没有找到这家店，试试更完整的店名或粘贴高德链接' : '') }); })
      .catch(() => { if (active) setSearchState({ key: searchKey, places: [], message: '暂时搜不到，仍可手动填写店铺信息' }); }), 450);
    return () => { active = false; clearTimeout(t); };
  }, [query, f.city, searchEnabled, searchKey]);
  const searching = searchEnabled && searchState?.key !== searchKey;
  const pois = searchEnabled && searchState?.key === searchKey ? searchState.places : [];
  const searchMessage = searchEnabled && searchState?.key === searchKey ? searchState.message : '';
  const selectPoi = (place: AmapPlace) => {
    const url = poiUrl(place);
    set({ name: place.name, address: place.address, city: place.city, lat: place.lat, lng: place.lng, amapUrl: url,
      ...(place.price != null ? { price: String(place.price) } : {}), category: f.category || (categories.includes(place.category) ? place.category : '') });
    setImportedUrl(url);
    setSourceOpen(false);
    haptic.tick();
  };

  const readAmap = async (text: string) => {
    const url = amapShareUrl(text);
    if (!url) throw new Error('没有找到高德链接，请在高德地点页点「分享 → 复制链接」');
    const result = await api.post<{ place: AmapPlace | null; poiId: string | null; price: number | null; amapUrl: string; location: { name: string; address: string; lat: number; lng: number } | null }>('/api/amap/resolve', { url, shareText: text.slice(0, 10000), key: AMAP_KEY });
    const place = result.place;
    const urlToSave = place ? poiUrl(place) : result.amapUrl;
    setImportedUrl(urlToSave);
    return {
      amapUrl: urlToSave,
      ...((place?.price ?? result.price) != null ? { price: String(place?.price ?? result.price) } : {}),
      lat: place?.lat ?? result.location?.lat ?? null,
      lng: place?.lng ?? result.location?.lng ?? null,
      ...(place?.name || result.location?.name ? { name: place?.name || result.location!.name } : {}),
      ...(place?.address || result.location?.address ? { address: place?.address || result.location!.address, city: place?.city || '' } : {}),
    };
  };

  const pasteAmap = async () => {
    setImporting(true);
    try {
      const patch = await readAmap(await Clipboard.getStringAsync());
      set(patch);
      haptic.success();
      setSourceOpen(false);
      toast(patch.lat != null ? '已读取地点' : '已关联高德链接');
    } catch (e) {
      toast((e as Error).message, '📍');
    } finally {
      setImporting(false);
    }
  };

  const pasteXhs = async () => {
    const text = await Clipboard.getStringAsync();
    const { url, title } = parseXhsShare(text ?? '');
    if (!url) return toast('剪贴板里没有链接', '⚠️', '在小红书点「分享」→「复制链接」');
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
    if (await updateCategories([...categories, name])) {
      set({ category: name });
      if (!managing) setCategoryOpen(false);
    }
  };

  const remove = async () => {
    if (!(await confirm('删除这家店？', '这家店的所有探店记录和照片也会一起删除'))) return;
    await api.del(`/api/places/${params.id}`);
    invalidate('places');
    invalidate('visits');
    router.dismissTo('/eats');
  };

  const busy = saving || importing || locating;
  const linked = !!f.amapUrl && f.amapUrl === importedUrl;
  const openLink = async () => {
    setImporting(true);
    try { set(await readAmap(f.amapUrl)); setSourceOpen(false); }
    catch (error) { toast((error as Error).message, '📍'); }
    finally { setImporting(false); }
  };

  return (
    <SheetScreen title={params.id ? '编辑这家店' : '收藏一家店'} action={<Button title="保存" onPress={save} loading={saving} disabled={importing || locating || categorySaving} style={{ height: 38, paddingHorizontal: 18 }} />}>
      <View style={styles.intro}>
        <Txt style={styles.eyebrow}>OUR NEXT BITE</Txt>
        <Txt v="heading">把下一顿心动，收进口袋 ♡</Txt>
      </View>

      <View style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={8}><View style={styles.iconBubble}><MapPin size={17} color={colors.accentStrong} /></View><Txt v="bodyStrong">{linked ? '心动的这家店' : '想收藏哪家？'}</Txt></Row>
          {linked && <PressScale disabled={busy} onPress={() => { set({ amapUrl: '', lat: null, lng: null }); setImportedUrl(''); setDetailsOpen(false); }} style={styles.smallAction}><Txt v="caption" color={colors.accentStrong}>换一家</Txt></PressScale>}
        </Row>
        {linked ? <View style={{ gap: 7 }}>
          <Txt v="heading">{f.name || '已关联高德店铺'}</Txt>
          <Txt v="caption">{[f.city, f.address].filter(Boolean).join(' · ') || '保存前可以补充地址'}</Txt>
          <PressScale onPress={() => setDetailsOpen(!detailsOpen)} style={styles.inline}><Pencil size={12} color={colors.muted} /><Txt v="caption">修正店名或地址</Txt><ChevronDown size={13} color={colors.muted} /></PressScale>
        </View> : <>
          <Field label="店名" value={f.name} editable={!busy} maxLength={80} onChangeText={(name) => set({ name })} placeholder="输入店名，选中对应分店" />
          {searching && <Row gap={7}><ActivityIndicator size="small" color={colors.muted} /><Txt v="caption">正在高德找这家店…</Txt></Row>}
          {!!searchMessage && <Txt v="caption">{searchMessage}</Txt>}
          {pois.length > 0 && <View style={styles.searchResults}>{pois.map((place) => <PressScale key={place.id} disabled={busy} onPress={() => selectPoi(place)} style={styles.poi}>
            <Search size={16} color={colors.muted} /><View style={{ flex: 1, gap: 3 }}><Txt v="bodyStrong" numberOfLines={1}>{place.name}</Txt><Txt v="caption" numberOfLines={1}>{[place.city, place.address].filter(Boolean).join(' ')}</Txt></View><ChevronRight size={16} color={colors.muted} />
          </PressScale>)}</View>}
          <View style={styles.importRow}>
            <PressScale onPress={pasteAmap} disabled={busy} style={styles.importButton}>{importing ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <ClipboardPaste size={16} color={colors.accentStrong} />}<Txt v="bodyStrong" color={colors.accentStrong} style={{ fontSize: 14 }}>粘贴高德分享</Txt></PressScale>
            <PressScale onPress={() => setSourceOpen(!sourceOpen)} disabled={busy} style={styles.smallAction}><Link2 size={15} color={colors.muted} /><Txt v="caption">输入链接</Txt></PressScale>
          </View>
        </>}
        {sourceOpen && <View style={{ gap: 10 }}><Field value={f.amapUrl} editable={!busy} onChangeText={(amapUrl) => set({ amapUrl, lat: null, lng: null })} placeholder="粘贴高德链接或分享文案" autoCapitalize="none" autoCorrect={false} /><Button title="读取这家店" onPress={openLink} loading={importing} disabled={saving || !f.amapUrl} /></View>}
        {detailsOpen && <View style={{ gap: 12, borderTopWidth: 1, borderColor: colors.line, paddingTop: 14 }}>
          <Field label="店名" value={f.name} maxLength={80} editable={!busy} onChangeText={(name) => set({ name })} />
          <Field label="城市" value={f.city} maxLength={40} onChangeText={(city) => set({ city })} placeholder="例如：上海" />
          <Field label="地址" value={f.address} maxLength={200} editable={!busy} onChangeText={(address) => set({ address })} placeholder="街道、商场、楼层" />
        </View>}
      </View>

      {(linked || f.lat != null) && <LivePlaceInfo key={`${f.amapUrl}:${f.lat}:${f.lng}`} destination={{ name: f.name, lat: f.lat, lng: f.lng, city: f.city, address: f.address, amapUrl: f.amapUrl || null }} />}

      <View style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}><Txt v="bodyStrong">我的收藏</Txt></Row>
        <View style={styles.card}>
          <View style={styles.statusRow}>{([{ value: 'want', label: '想去尝尝', Icon: Heart }, { value: 'visited', label: '已经吃过', Icon: Check }] as const).map(({ value, label, Icon }) => <PressScale key={value} accessibilityRole="radio" accessibilityState={{ checked: f.status === value }} onPress={() => set({ status: value })} style={[styles.statusOption, f.status === value && styles.statusActive]}><Icon size={17} color={f.status === value ? colors.accentStrong : colors.muted} /><Txt v="bodyStrong" style={{ fontSize: 14 }} color={f.status === value ? colors.accentStrong : colors.muted}>{label}</Txt></PressScale>)}</View>
          <PressScale accessibilityLabel="选择我的店铺类型" onPress={() => setCategoryOpen(true)} style={styles.settingRow}><Row gap={8}><Txt style={{ fontSize: 19 }}>{categoryEmoji(f.category)}</Txt><Txt v="bodyStrong" style={{ fontSize: 14 }}>类型</Txt></Row><Row gap={5}><Txt v="caption" color={f.category ? colors.ink : colors.muted}>{f.category || '选一个喜欢的分类'}</Txt><ChevronRight size={16} color={colors.muted} /></Row></PressScale>
          <Field label="我的备注" value={f.note} editable={!saving} onChangeText={(note) => set({ note })} placeholder="想点的菜、约好的人，或一个想去的理由…" multiline />
          <Field label="人均（元）" value={f.price} editable={!busy} onChangeText={(price) => set({ price: price.replace(/[^\d]/g, '') })} keyboardType="number-pad" placeholder="可手动填写或修改" />
          {f.status === 'visited' && <View style={{ gap: 8 }}><Txt v="label">我们的评分</Txt><StarRating value={f.rating} onChange={(rating) => set({ rating })} size={30} /></View>}
        </View>
      </View>

      <View style={styles.card}>
        <PressScale onPress={() => setExtrasOpen(!extrasOpen)} style={styles.settingRow}><Txt v="bodyStrong" style={{ fontSize: 15 }}>更多</Txt><ChevronDown size={17} color={colors.muted} /></PressScale>
        {extrasOpen && <View style={{ gap: 16 }}>
          {!linked && <View style={{ gap: 12 }}><Field label="城市" value={f.city} maxLength={40} onChangeText={(city) => set({ city })} placeholder="帮助找到正确的分店" /><Field label="地址" value={f.address} maxLength={200} editable={!busy} onChangeText={(address) => set({ address })} placeholder="街道、商场、楼层" /><PressScale onPress={locate} disabled={busy} style={styles.inline}>{locating ? <ActivityIndicator size="small" /> : <LocateFixed size={15} color={colors.sageInk} />}<Txt v="caption" color={colors.sageInk}>我就在店里，用当前位置标记店铺</Txt></PressScale></View>}
          <PressScale onPress={pasteXhs} disabled={busy} style={styles.extraLink}><View style={styles.xhsBadge}><Txt color={colors.white} style={{ fontSize: 10, fontWeight: '700' }}>小红书</Txt></View><View style={{ flex: 1 }}><Txt v="bodyStrong" style={{ fontSize: 14 }}>{f.xhsUrl ? '已关联小红书笔记' : '粘贴小红书笔记'}</Txt><Txt v="caption">{f.xhsUrl ? '点击更换' : '先复制笔记分享链接'}</Txt></View><ClipboardPaste size={16} color={colors.muted} /></PressScale>
          {!!f.xhsUrl && <Field label="小红书链接" value={f.xhsUrl} onChangeText={(xhsUrl) => set({ xhsUrl })} autoCapitalize="none" />}
          <View style={{ gap: 8 }}><Txt v="label">封面</Txt><PhotoPicker value={cover} onChange={setCover} max={1} size={90} /></View>
        </View>}
      </View>
      {params.id && <Button title="删除这家店" variant="ghost" onPress={remove} disabled={busy} />}

      <Sheet visible={categoryOpen} onClose={() => setCategoryOpen(false)} dragAnywhere={false} style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}><Txt v="heading">类型</Txt><PressScale accessibilityLabel="关闭类型面板" onPress={() => setCategoryOpen(false)} style={styles.smallAction}><X size={20} color={colors.ink} /></PressScale></Row>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
          <Row style={{ justifyContent: 'flex-end' }}><PressScale onPress={() => setManaging(!managing)} style={styles.smallAction}><Txt v="caption" color={colors.accentStrong}>{managing ? '完成管理' : '管理'}</Txt></PressScale></Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...new Set([...categories, ...(f.category && !categories.includes(f.category) ? [f.category] : [])])].map((c) => <Row key={c} gap={0}><Chip label={`${categoryEmoji(c)} ${c}`} active={f.category === c} onPress={() => { set({ category: f.category === c ? '' : c }); if (!managing) setCategoryOpen(false); }} />{managing && categories.includes(c) && <PressScale accessibilityLabel={`删除类型${c}`} disabled={categorySaving || !preferences.data} onPress={async () => { if (await updateCategories(categories.filter((name) => name !== c)) && f.category === c) set({ category: '' }); }} style={styles.smallAction}><X size={14} color={colors.muted} /></PressScale>}</Row>)}
          </View>
          {preferences.error && <PressScale onPress={preferences.refresh}><Txt v="caption">加载失败，点此重试</Txt></PressScale>}
          <Row gap={8}><View style={{ flex: 1 }}><Field value={newCategory} onChangeText={setNewCategory} maxLength={20} placeholder="添加新类型，例如：私房菜" onSubmitEditing={addCategory} /></View><Button title="添加" icon={Plus} onPress={addCategory} loading={categorySaving} disabled={!newCategory.trim() || !preferences.data} /></Row>
        </ScrollView>
      </Sheet>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 6, paddingVertical: 4, gap: 6 },
  eyebrow: { fontFamily: fonts.display, color: colors.accentStrong, fontSize: 10, letterSpacing: 2 },
  card: { padding: 16, gap: 16, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  iconBubble: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  smallAction: { minHeight: 40, minWidth: 36, padding: 6, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, alignSelf: 'flex-start' },
  importRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  importButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg },
  searchResults: { borderTopWidth: 1, borderColor: colors.line },
  poi: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  statusRow: { flexDirection: 'row', gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, padding: 5 },
  statusOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 16 },
  statusActive: { backgroundColor: colors.surface },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40 },
  extraLink: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  xhsBadge: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#FF526F', alignItems: 'center', justifyContent: 'center' },
});
