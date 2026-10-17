import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GalleryGrid } from '@/components/GalleryGrid';
import { toast } from '@/components/motion';
import { SheetScreen } from '@/components/Screen';
import { QueryFallback } from '@/components/Skeleton';
import { Button, Empty } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { invalidate, useQuery } from '@/lib/store';
import type { Album, GalleryItem } from '@/lib/types';

/** 从「全部照片」里挑几张放进相册；已经在相册里的不显示 */
export default function AddToAlbum() {
  const { album: albumId } = useLocalSearchParams<{ album: string }>();
  const albums = useQuery<Album[]>('/api/albums');
  const all = useQuery<GalleryItem[]>('/api/gallery?limit=3000');
  const inside = useQuery<GalleryItem[]>(`/api/gallery?limit=3000&album=${albumId}`);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const album = albums.data?.find((a) => a.id === albumId);
  const already = new Set((inside.data ?? []).map((i) => i.id));
  const items = (all.data ?? []).filter((i) => !already.has(i.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      const res = await api.post<{ added: number }>(`/api/albums/${albumId}/items`, { ids: [...selected] });
      haptic.success();
      toast(`放进了 ${res.added} 项`, '📁', album?.title);
      invalidate('gallery');
      invalidate('albums');
      router.back();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetScreen title={album ? `添加到「${album.title}」` : '添加照片'} action={<Button title={selected.size ? `添加 ${selected.size}` : '添加'} onPress={save} loading={saving} disabled={!selected.size} style={{ height: 38, paddingHorizontal: 16 }} />}>
      <QueryFallback q={all} kind="grid" count={6} />
      {all.data && items.length === 0 ? (
        <Empty emoji="🖼️" title="没有可以添加的照片" />
      ) : (
        <View style={{ gap: 10 }}>
          <GalleryGrid items={items} selecting selected={selected} onToggle={toggle} onOpen={() => {}} onStartSelect={toggle} />
        </View>
      )}
    </SheetScreen>
  );
}
