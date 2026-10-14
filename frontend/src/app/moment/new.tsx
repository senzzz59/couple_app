import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { toast } from '@/components/motion';
import { PhotoItem, PhotoPicker } from '@/components/Photos';
import { SheetScreen } from '@/components/Screen';
import { Button, Chip, PressScale, Txt } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { MOODS } from '@/lib/nudge';
import { invalidate, useQuery } from '@/lib/store';
import type { Place } from '@/lib/types';
import { colors, radius } from '@/theme';

export default function NewMoment() {
  const places = useQuery<Place[]>('/api/places');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const post = async () => {
    if (!content.trim() && !photos.length) return toast('写点什么或者选张照片吧', '✏️');
    setSaving(true);
    try {
      const names = await uploadImages(photos.map((p) => p.local!).filter(Boolean));
      await api.post('/api/moments', { content: content.trim() || null, photos: names, mood, placeId });
      haptic.success();
      invalidate('moments');
      router.back();
      router.navigate('/moments');
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScreen title="发动态" action={<Button title="发布" variant="accent" onPress={post} loading={saving} style={{ height: 38, paddingHorizontal: 18 }} />}>
      <TextInput
        autoFocus
        value={content}
        onChangeText={setContent}
        placeholder="今天想和 TA 分享什么？"
        placeholderTextColor={colors.faint}
        multiline
        maxLength={3000}
        style={{ fontSize: 18, lineHeight: 26, color: colors.ink, minHeight: 120, textAlignVertical: 'top' }}
      />
      <PhotoPicker value={photos} onChange={setPhotos} max={9} />

      <View style={{ gap: 8 }}>
        <Txt v="label" style={{ marginLeft: 4 }}>
          心情
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {MOODS.map((m) => (
            <PressScale
              key={m}
              scaleTo={0.85}
              onPress={() => setMood(mood === m ? null : m)}
              style={{ width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: mood === m ? colors.accentSoft : colors.surface, borderWidth: 1.5, borderColor: mood === m ? colors.accent : 'transparent' }}>
              <Text style={{ fontSize: 24 }}>{m}</Text>
            </PressScale>
          ))}
        </ScrollView>
      </View>

      {!!places.data?.length && (
        <View style={{ gap: 8 }}>
          <Txt v="label" style={{ marginLeft: 4 }}>
            在哪家店？（可选）
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {places.data.map((p) => (
              <Chip key={p.id} label={p.name} active={placeId === p.id} onPress={() => setPlaceId(placeId === p.id ? null : p.id)} color={colors.butterInk} />
            ))}
          </ScrollView>
        </View>
      )}
    </SheetScreen>
  );
}
