import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { api, getBaseUrl } from './api';
import { mediaUrl } from './media';
import type { GalleryItem, MediaItem } from './types';

/** 全屏查看器里的一项 */
export type ViewerEntry = MediaItem & {
  /** 相册条目的 id（可收藏、删除、加入相册） */
  id?: string;
  favorite?: boolean;
  original?: string | null;
  fileName?: string | null;
  takenAt?: string;
  createdBy?: string | null;
  size?: number | null;
};

export type ViewerSession = {
  items: ViewerEntry[];
  index: number;
  /** gallery：相册（收藏 / 删除 / 加入相册）；moment：动态（可存进相册）；plain：只看 */
  mode: 'gallery' | 'moment' | 'plain';
  /** 动态的发布时间，存进相册时当作拍摄时间 */
  takenAt?: string;
  albumId?: string;
};

let session: ViewerSession | null = null;
export const viewerSession = () => session;

export function openViewer(items: ViewerEntry[], index: number, opts: Partial<Omit<ViewerSession, 'items' | 'index'>> = {}) {
  session = { items, index, mode: opts.mode ?? 'plain', takenAt: opts.takenAt, albumId: opts.albumId };
  router.push('/viewer');
}

export const galleryEntry = (g: GalleryItem): ViewerEntry => ({
  kind: g.kind,
  image: g.image,
  video: g.video,
  w: g.width,
  h: g.height,
  duration: g.duration,
  id: g.id,
  favorite: g.favorite,
  original: g.original,
  fileName: g.fileName,
  takenAt: g.takenAt,
  createdBy: g.createdBy,
  size: g.size,
});

const isMobileWeb = () => Platform.OS === 'web' && /iPhone|iPad|iPod|Android/i.test(globalThis.navigator?.userAgent ?? '');

function fileNameOf(e: ViewerEntry, url: string, which: 'image' | 'video') {
  const ext = url.split('?')[0].split('.').pop() ?? 'jpg';
  const base = (e.fileName ?? '').replace(/\.[^.]+$/, '') || `us-${(e.takenAt ?? new Date().toISOString()).slice(0, 10)}`;
  return `${base}${which === 'video' && e.kind === 'live' ? '-live' : ''}.${ext}`;
}

function anchorDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 保存到手机 / 下载：
 * - 手机浏览器：用系统分享面板，iPhone 上可以直接「存储图像 / 视频」到相册
 * - 电脑：直接下载（原图优先）
 */
export async function saveEntry(e: ViewerEntry): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const targets: { url: string; name: string }[] = [];
  if (e.kind !== 'video' && e.image) {
    const url = e.original ? mediaUrl(e.original, 'orig')! : mediaUrl(e.image)!;
    targets.push({ url, name: fileNameOf(e, url, 'image') });
  }
  if ((e.kind === 'video' || e.kind === 'live') && e.video) {
    // 视频下载原片（如果有）：转码后的版本画质会低一些
    const url = e.kind === 'video' && e.original ? mediaUrl(e.original, 'orig')! : mediaUrl(e.video)!;
    targets.push({ url, name: fileNameOf(e, url, 'video') });
  }
  if (!targets.length) return 'cancelled';
  if (Platform.OS !== 'web') {
    await Linking.openURL(targets[0].url);
    return 'downloaded';
  }
  const nav = globalThis.navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (isMobileWeb() && typeof nav.share === 'function') {
    try {
      const files = await Promise.all(
        targets.map(async (t) => {
          const blob = await (await fetch(t.url)).blob();
          return new File([blob], t.name, { type: blob.type });
        })
      );
      if (!nav.canShare || nav.canShare({ files })) {
        await nav.share({ files });
        return 'shared';
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      // 分享失败就退回普通下载
    }
  }
  for (const t of targets) anchorDownload(`${t.url}?dl=${encodeURIComponent(t.name)}`);
  return 'downloaded';
}

/** 一次下载多张：服务器打包成 zip */
export async function downloadMany(ids: string[]) {
  const { url } = await api.post<{ url: string }>('/api/gallery/archive-link', { ids });
  const full = `${getBaseUrl()}${url}`;
  if (Platform.OS === 'web') anchorDownload(full);
  else await Linking.openURL(full);
}
