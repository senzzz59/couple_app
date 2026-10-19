import type { LocalMedia } from './media';

/** 等待上传的一项（连同文件本身），用来在页面被关掉后继续上传 */
export type StoredUpload = {
  id: string;
  albumId?: string;
  addedAt: number;
  dateMode?: 'taken' | 'upload';
  meta: Omit<LocalMedia, 'uri' | 'videoUri' | 'posterUri'>;
  still?: Blob;
  video?: Blob;
  poster?: Blob;
};

// App 里上传在后台照常进行，不需要存下来；网页版见 uploadStore.web.ts
export async function saveUpload(_rec: StoredUpload) {}
export async function deleteUpload(_id: string) {}
export async function loadUploads(): Promise<StoredUpload[]> {
  return [];
}
