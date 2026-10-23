import { and, eq } from 'drizzle-orm';

import { db, schema } from './db/index.ts';
import { env } from './env.ts';
import { copyFile } from './files.ts';
import { dayIn, normalizeMedia, visitPhotosOf } from './media.ts';
import { broadcast } from './realtime.ts';
import type { MediaItem } from './db/schema.ts';

/**
 * 发动态时带上了餐厅：给这家店记一次探店，日期是发动态那天，照片是动态里的照片。
 * 照片复制一份（删动态不会让探店记录的照片消失），备注留空；还在「想去」的店改成「去过」。
 */
export async function visitFromMoment(moment: { placeId?: string | null; photos?: string[] | null; media?: MediaItem[] | null; createdAt?: Date | string | null }, by: string, coupleId: string) {
  if (!moment.placeId) return null;
  const [place] = await db.select().from(schema.places).where(and(eq(schema.places.coupleId, coupleId), eq(schema.places.id, moment.placeId)));
  if (!place) return null;
  const photos: string[] = [];
  for (const name of visitPhotosOf(normalizeMedia(moment.photos, moment.media))) {
    const copy = await copyFile(name).catch(() => null);
    if (copy) photos.push(copy);
  }
  const id = crypto.randomUUID();
  await db.insert(schema.visits).values({
    id,
    coupleId,
    placeId: place.id,
    date: dayIn(env.tz, moment.createdAt ? new Date(moment.createdAt) : new Date()),
    photos,
    dishes: [],
    // 备注留空：动态的文字不搬过来
    note: null,
    createdBy: by,
  });
  if (place.status === 'want') await db.update(schema.places).set({ status: 'visited' }).where(eq(schema.places.id, place.id));
  broadcast(coupleId, { type: 'change', collection: 'visits', id, by });
  broadcast(coupleId, { type: 'change', collection: 'places', id: place.id, by });
  return id;
}
