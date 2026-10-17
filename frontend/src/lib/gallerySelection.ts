import { Download, FolderMinus, FolderPlus, Heart, Image as ImageIcon, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { toast } from '@/components/motion';
import type { SelectionAction } from '@/components/SelectionBar';

import { api } from './api';
import { confirm } from './confirm';
import { haptic } from './haptics';
import { invalidate } from './store';
import type { GalleryItem } from './types';
import { downloadMany, galleryEntry, saveEntry } from './viewer';

/** 相册多选：选择状态 + 底部操作条上的动作 */
export function useGallerySelection(items: GalleryItem[], opts: { albumId?: string; onPickAlbum: () => void }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const ids = [...selected];
  const chosen = items.filter((i) => selected.has(i.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const start = (id?: string) => {
    setSelecting(true);
    setSelected(new Set(id ? [id] : []));
  };
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const allSelected = items.length > 0 && selected.size === items.length;
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, '⚠️');
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    run(async () => {
      if (chosen.length === 1) {
        await saveEntry(galleryEntry(chosen[0]));
      } else {
        await downloadMany(ids);
        toast(`正在打包下载 ${ids.length} 项原图`);
      }
    });

  const favorite = () =>
    run(async () => {
      const action = chosen.every((i) => i.favorite) ? 'unfavorite' : 'favorite';
      await api.post('/api/gallery/batch', { ids, action });
      haptic.success();
      toast(action === 'favorite' ? `收藏了 ${ids.length} 项` : '取消收藏了', '❤️');
      invalidate('gallery');
      stop();
    });

  const remove = () =>
    run(async () => {
      if (!(await confirm(`删除这 ${ids.length} 项？`, '两个人的相册里都会删除，所在的所有相册里也会一起消失，不能恢复'))) return;
      await api.post('/api/gallery/batch', { ids, action: 'delete' });
      haptic.success();
      toast(`删除了 ${ids.length} 项`, '🗑️');
      invalidate('gallery');
      invalidate('albums');
      stop();
    });

  const removeFromAlbum = () =>
    run(async () => {
      if (!opts.albumId) return;
      await api.post(`/api/albums/${opts.albumId}/items/remove`, { ids });
      haptic.success();
      toast(`已移出 ${ids.length} 项`);
      invalidate('gallery');
      invalidate('albums');
      stop();
    });

  const setCover = () =>
    run(async () => {
      if (!opts.albumId || ids.length !== 1) return;
      await api.patch(`/api/albums/${opts.albumId}`, { coverId: ids[0] });
      haptic.success();
      toast('已设为封面', '✓');
      invalidate('albums');
      stop();
    });

  const actions: SelectionAction[] = [
    { icon: Download, label: ids.length > 1 ? '下载' : '保存', onPress: download, disabled: busy },
    { icon: Heart, label: chosen.length && chosen.every((i) => i.favorite) ? '取消收藏' : '收藏', onPress: favorite, disabled: busy },
    { icon: FolderPlus, label: '放进相册', onPress: opts.onPickAlbum, disabled: busy },
    ...(opts.albumId
      ? [
          { icon: ImageIcon, label: '设为封面', onPress: setCover, disabled: busy || ids.length !== 1 },
          { icon: FolderMinus, label: '移出', onPress: removeFromAlbum, disabled: busy },
        ]
      : []),
    { icon: Trash2, label: '删除', onPress: remove, danger: true, disabled: busy },
  ];

  return { selecting, selected, ids, toggle, start, stop, selectAll, allSelected, actions };
}
