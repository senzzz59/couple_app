import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { invalidate } from '@/lib/store';
import type { Album } from '@/lib/types';
import { colors, radius } from '@/theme';

import { ALBUM_EMOJIS } from './AlbumPicker';
import { toast } from './motion';
import { Sheet } from './Sheet';
import { Button, Field, PressScale, Txt } from './ui';

/** 新建 / 编辑相册 */
export function AlbumEditor({ visible, onClose, album, onSaved }: { visible: boolean; onClose: () => void; album?: Album | null; onSaved?: (a: Album) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {visible && <Body key={album?.id ?? 'new'} album={album} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function Body({ album, onClose, onSaved }: { album?: Album | null; onClose: () => void; onSaved?: (a: Album) => void }) {
  const [title, setTitle] = useState(album?.title ?? '');
  const [emoji, setEmoji] = useState(album?.emoji ?? ALBUM_EMOJIS[0]);
  const [description, setDescription] = useState(album?.description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast('给相册起个名字吧', '✏️');
    setSaving(true);
    try {
      const body = { title: title.trim(), emoji, description: description.trim() || null };
      const saved = album ? await api.patch<Album>(`/api/albums/${album.id}`, body) : await api.post<Album>('/api/albums', body);
      haptic.success();
      invalidate('albums');
      onClose();
      onSaved?.({ ...(album ?? { count: 0, cover: null }), ...saved } as Album);
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Txt v="heading">{album ? '编辑相册' : '新建相册'}</Txt>
      <View style={styles.emojis}>
        {ALBUM_EMOJIS.map((e) => (
          <PressScale key={e} scaleTo={0.85} onPress={() => setEmoji(e)} style={[styles.emoji, emoji === e && styles.emojiOn]}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </PressScale>
        ))}
      </View>
      <Field label="名字" value={title} onChangeText={setTitle} placeholder="比如：第一次旅行、你的生日" maxLength={40} autoFocus={!album} onSubmitEditing={save} />
      <Field label="描述 · 可选" value={description} onChangeText={setDescription} placeholder="写一句关于这个相册的话" maxLength={200} />
      <Button title={album ? '保存' : '创建相册'} onPress={save} loading={saving} disabled={!title.trim()} />
    </>
  );
}

const styles = StyleSheet.create({
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  emojiOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
