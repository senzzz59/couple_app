import { router, useLocalSearchParams } from 'expo-router';
import { Heart, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { DatePicker } from '@/components/DatePicker';
import { celebrate, StarRating, toast } from '@/components/motion';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetLoading, SheetScreen } from '@/components/Screen';
import { Button, Field, IconButton, Row, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toDay } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { invalidate, useQuery } from '@/lib/store';
import type { Dish, Place, Visit } from '@/lib/types';
import { colors, radius } from '@/theme';

/** 记录一次探店：日期、照片、吃了什么（可以标记好吃）、评分、感想 */
export default function NewVisit() {
  const { placeId, id } = useLocalSearchParams<{ placeId: string; id?: string }>();
  const existing = useQuery<Visit>(id ? `/api/visits/${id}` : null);
  if (id && !existing.data) return <SheetLoading title="编辑记录" q={existing} />;
  return <VisitForm placeId={placeId} id={id} initial={existing.data} />;
}

function VisitForm({ placeId, id, initial: v }: { placeId: string; id?: string; initial?: Visit }) {
  const place = useQuery<Place>(`/api/places/${placeId}`);
  const [date, setDate] = useState(v?.date ?? toDay(new Date()));
  const [photos, setPhotos] = useState<PhotoItem[]>(v?.photos.map((remote) => ({ remote })) ?? []);
  const [dishes, setDishes] = useState<Dish[]>(v?.dishes ?? []);
  const [dish, setDish] = useState('');
  const [rating, setRating] = useState(v?.rating ?? 0);
  const [note, setNote] = useState(v?.note ?? '');
  const [saving, setSaving] = useState(false);

  const addDish = () => {
    const name = dish.trim();
    if (!name || dishes.some((d) => d.name === name)) return setDish('');
    haptic.tick();
    setDishes([...dishes, { name, liked: false }]);
    setDish('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const uploaded = await uploadImages(photos.filter((p) => p.local).map((p) => p.local!));
      let k = 0;
      const names = photos.map((p) => p.remote ?? uploaded[k++]);
      const body = { placeId, date, photos: names, dishes, rating: rating || null, note: note.trim() || null };
      if (id) await api.patch(`/api/visits/${id}`, body);
      else await api.post('/api/visits', body);
      // 第一次去：自动把“想去”变成“吃过”，并带上评分
      const p = place.data;
      if (p && (p.status === 'want' || (rating && !p.rating))) {
        await api.patch(`/api/places/${placeId}`, { status: 'visited', ...(rating && !p.rating ? { rating } : {}) });
        if (p.status === 'want') setTimeout(celebrate, 300);
      }
      haptic.success();
      invalidate('visits');
      invalidate('places');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm('删除这次记录？', '照片也会一起删除'))) return;
    await api.del(`/api/visits/${id}`);
    invalidate('visits');
    router.back();
  };

  return (
    <SheetScreen title={place.data?.name ?? '记录一次'} action={<Button title="保存" onPress={save} loading={saving} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <DatePicker label="哪天去的" value={date} onChange={setDate} />

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          照片
        </Txt>
        <PhotoPicker value={photos} onChange={setPhotos} max={20} />
      </View>

      <View style={{ gap: 10 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          吃了什么 · 点爱心标记好吃
        </Txt>
        <Animated.View layout={LinearTransition.springify().damping(18)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {dishes.map((d, i) => (
            <Animated.View key={d.name} entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(120)} layout={LinearTransition.springify()}>
              <Pressable
                onPress={() => {
                  haptic.tick();
                  setDishes(dishes.map((x, j) => (j === i ? { ...x, liked: !x.liked } : x)));
                }}
                style={[styles.dish, d.liked && styles.dishLiked]}>
                <Heart size={14} color={d.liked ? colors.accent : colors.faint} fill={d.liked ? colors.accent : 'transparent'} />
                <Txt v="body" style={{ fontSize: 14 }}>
                  {d.name}
                </Txt>
                <Pressable hitSlop={8} onPress={() => setDishes(dishes.filter((_, j) => j !== i))}>
                  <X size={14} color={colors.muted} />
                </Pressable>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.View>
        <Row style={styles.dishInput}>
          <TextInput value={dish} onChangeText={setDish} placeholder="输入菜名，回车添加" placeholderTextColor={colors.faint} style={{ flex: 1, minWidth: 0, fontSize: 16, color: colors.ink, height: 48 }} onSubmitEditing={addDish} blurOnSubmit={false} returnKeyType="done" />
          <IconButton icon={Plus} size={36} bg={colors.ink} color={colors.white} onPress={addDish} />
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          这次的评分
        </Txt>
        <StarRating value={rating} onChange={setRating} size={32} />
      </View>

      <Field label="感想" value={note} onChangeText={setNote} placeholder="好吃吗？下次还来吗？" multiline />
      {id && <Button title="删除这次记录" variant="ghost" onPress={remove} />}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  dish: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  dishLiked: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  dishInput: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingLeft: 16, paddingRight: 6, borderWidth: 1, borderColor: colors.line },
});
