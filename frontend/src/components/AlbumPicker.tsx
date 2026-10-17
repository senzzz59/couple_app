import { Image } from 'expo-image';
import { Check, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { mediaUrl } from '@/lib/media';
import { invalidate, useQuery } from '@/lib/store';
import type { Album } from '@/lib/types';
import { colors, radius } from '@/theme';

import { toast } from './motion';
import { Sheet } from './Sheet';
import { Button, PressScale, Row, Txt } from './ui';

export const ALBUM_EMOJIS = ['📷', '🏝️', '🍰', '🎂', '🌸', '🎄', '✈️', '🐱', '💍', '🎡', '🌙', '🍜'];

/** 把照片放进某个相册（可以当场新建一个） */
export function AlbumPicker({ visible, onClose, ids, exclude, onAdded }: { visible: boolean; onClose: () => void; ids: string[]; exclude?: string; onAdded?: () => void }) {
  const albums = useQuery<Album[]>(visible ? '/api/albums' : null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (album: Pick<Album, 'id' | 'title'>) => {
    setBusy(album.id);
    try {
      const res = await api.post<{ added: number }>(`/api/albums/${album.id}/items`, { ids });
      haptic.success();
      toast(res.added ? `已放进「${album.title}」` : `都已经在「${album.title}」里了`, '📁', res.added ? `${res.added} 项` : undefined);
      invalidate('albums');
      invalidate('gallery');
      onAdded?.();
      onClose();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy('new');
    try {
      const album = await api.post<Album>('/api/albums', { title: t, emoji: ALBUM_EMOJIS[Math.floor(Math.random() * ALBUM_EMOJIS.length)] });
      setTitle('');
      setCreating(false);
      await add(album);
    } catch (e) {
      toast((e as Error).message, '⚠️');
      setBusy(null);
    }
  };

  const list = (albums.data ?? []).filter((a) => a.id !== exclude);
  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere={false}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="heading">放进相册</Txt>
        <Txt v="caption">已选 {ids.length} 项</Txt>
      </Row>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {creating ? (
          <Row gap={8} style={styles.row}>
            <TextInput autoFocus value={title} onChangeText={setTitle} placeholder="相册名字，比如：第一次旅行" placeholderTextColor={colors.faint} maxLength={40} onSubmitEditing={create} style={styles.input} />
            <Button title="创建" onPress={create} loading={busy === 'new'} disabled={!title.trim()} style={{ height: 40, paddingHorizontal: 16 }} />
          </Row>
        ) : (
          <PressScale onPress={() => setCreating(true)} style={styles.row}>
            <View style={[styles.cover, styles.newCover]}>
              <Plus size={22} color={colors.accentStrong} />
            </View>
            <Txt v="bodyStrong" color={colors.accentStrong}>
              新建相册
            </Txt>
          </PressScale>
        )}
        {list.map((a) => (
          <PressScale key={a.id} onPress={() => add(a)} disabled={!!busy} style={styles.row}>
            <View style={styles.cover}>
              {a.cover?.image ? <Image source={mediaUrl(a.cover.image, 'thumb')} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontSize: 22 }}>{a.emoji ?? '📷'}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="bodyStrong" numberOfLines={1}>
                {a.emoji ? `${a.emoji} ` : ''}
                {a.title}
              </Txt>
              <Txt v="caption">{a.count} 项</Txt>
            </View>
            {busy === a.id ? <Txt v="caption">放进去…</Txt> : <Check size={18} color={colors.faint} />}
          </PressScale>
        ))}
        {albums.data && !list.length && !creating && <Txt v="caption" style={{ textAlign: 'center', paddingVertical: 12 }}>还没有相册，先建一个吧</Txt>}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10 },
  cover: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  newCover: { backgroundColor: colors.accentSoft },
  input: { flex: 1, minWidth: 0, height: 42, fontSize: 16, color: colors.ink, paddingHorizontal: 8 },
});
