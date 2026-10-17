import { useSyncExternalStore } from 'react';

import { toast } from '@/components/motion';

import { api } from './api';
import { haptic } from './haptics';
import { pickMedia, releaseLocal, uploadMedia, type LocalMedia } from './media';
import { invalidate } from './store';

/**
 * 相册上传任务：在后台一项一项传，切换页面也不会中断；
 * 每传完一项就登记到相册，中途失败已经传好的不会丢。
 */
export type UploadJob = { total: number; done: number; progress: number; failed: number; status: 'uploading' | 'done'; albumId?: string; error?: string };

let job: UploadJob | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: UploadJob | null) => {
  job = next;
  emit();
};

export function useUploadJob() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => job
  );
}

const queue: { list: LocalMedia[]; albumId?: string }[] = [];
let running = false;

export function startGalleryUpload(list: LocalMedia[], albumId?: string) {
  if (!list.length) return;
  queue.push({ list, albumId });
  if (job?.status === 'uploading') set({ ...job, total: job.total + list.length });
  else set({ total: list.length, done: 0, progress: 0, failed: 0, status: 'uploading', albumId });
  if (!running) void run();
}

async function run() {
  running = true;
  while (queue.length) {
    const { list, albumId } = queue.shift()!;
    for (const m of list) {
      const base = job!;
      try {
        const [u] = await uploadMedia([m], { original: true, onProgress: (p) => set({ ...job!, progress: (base.done + p) / base.total }) });
        await api.post('/api/gallery', {
          albumId,
          items: [{ kind: u.kind, image: u.image, video: u.video, original: u.original ?? null, fileName: u.fileName ?? null, width: u.w ?? null, height: u.h ?? null, duration: u.duration ?? null, size: u.size ?? null, takenAt: u.takenAt ?? null }],
        });
        set({ ...job!, done: job!.done + 1, progress: (job!.done + 1) / job!.total });
        invalidate('gallery');
      } catch (e) {
        set({ ...job!, done: job!.done + 1, failed: job!.failed + 1, error: (e as Error).message });
      } finally {
        releaseLocal([m]);
      }
    }
  }
  running = false;
  const finished = job!;
  set({ ...finished, status: 'done', progress: 1 });
  invalidate('albums');
  if (finished.failed) toast(`${finished.failed} 项没传上去`, '⚠️', finished.error);
  else {
    haptic.success();
    toast(`已上传 ${finished.total} 项`, '✓');
  }
  setTimeout(() => job?.status === 'done' && set(null), 2500);
}

/** 选照片 / 视频并在后台上传到共享相册（可直接放进某个相册） */
export async function uploadToGallery(albumId?: string) {
  const picked = await pickMedia({ max: 300 });
  if (!picked.length) return;
  startGalleryUpload(picked, albumId);
}
