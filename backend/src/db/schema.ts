import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  datetime,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const id = () => varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID());
const userRef = (name: string) => varchar(name, { length: 36 });
const timestamps = {
  createdAt: timestamp('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
};

export const users = mysqlTable('users', {
  id: id(),
  email: varchar('email', { length: 191 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 100 }).notNull(),
  name: varchar('name', { length: 40 }).notNull().default(''),
  avatar: varchar('avatar', { length: 100 }),
  gender: mysqlEnum('gender', ['male', 'female']),
  birthday: date('birthday', { mode: 'string' }),
  birthdayLunar: boolean('birthday_lunar').notNull().default(false),
  mood: varchar('mood', { length: 16 }),
  moodText: varchar('mood_text', { length: 60 }),
  moodAt: datetime('mood_at', { fsp: 3 }),
  /** 在相册里让另一半看到自己正在看哪张 */
  shareViewing: boolean('share_viewing').notNull().default(true),
  ...timestamps,
});

export const pushTokens = mysqlTable('push_tokens', {
  token: varchar('token', { length: 191 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
});

/** 网页版（添加到主屏幕后）的推送订阅。endpoint 可能很长，用它的 sha256 作主键 */
export const webPushSubscriptions = mysqlTable('web_push_subscriptions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: varchar('p256dh', { length: 200 }).notNull(),
  auth: varchar('auth', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** 服务器自己生成并保存的密钥（例如网页推送的 VAPID 密钥），不用手动配置 */
export const appSecrets = mysqlTable('app_secrets', {
  name: varchar('name', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
});

export const pushReceipts = mysqlTable('push_receipts', {
  id: varchar('id', { length: 191 }).primaryKey(),
  token: varchar('token', { length: 191 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * 两个人共用的自定义设置（键值）：待办分类等。值的格式由 src/settings.ts 校验。
 */
export const sharedSettings = mysqlTable('shared_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: json('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
});

/** 涓や汉绌洪棿璁剧疆锛屽彧鏈?id=1 涓€琛?*/
export const space = mysqlTable('space', {
  id: int('id').primaryKey(),
  startDate: date('start_date', { mode: 'string' }),
  title: varchar('title', { length: 40 }),
  ...timestamps,
});

export const places = mysqlTable(
  'places',
  {
    id: id(),
    name: varchar('name', { length: 80 }).notNull(),
    address: varchar('address', { length: 200 }),
    city: varchar('city', { length: 40 }),
    lat: double('lat'),
    lng: double('lng'),
    category: varchar('category', { length: 20 }),
    status: mysqlEnum('status', ['want', 'visited']).notNull().default('want'),
    rating: double('rating'),
    price: int('price'),
    xhsUrl: varchar('xhs_url', { length: 500 }),
    amapUrl: varchar('amap_url', { length: 2000 }),
    note: text('note'),
    cover: varchar('cover', { length: 100 }),
    /** 高德上这家店的第一张照片（卡片和预览用）；空字符串表示查过但没有 */
    amapPhoto: varchar('amap_photo', { length: 600 }),
    createdBy: userRef('created_by'),
    ...timestamps,
  },
  (t) => [index('places_status_idx').on(t.status)]
);

export type Dish = { name: string; liked?: boolean };

export const visits = mysqlTable(
  'visits',
  {
    id: id(),
    placeId: varchar('place_id', { length: 36 })
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    photos: json('photos').$type<string[]>().notNull().$defaultFn(() => []),
    dishes: json('dishes').$type<Dish[]>().notNull().$defaultFn(() => []),
    rating: double('rating'),
    note: text('note'),
    createdBy: userRef('created_by'),
    ...timestamps,
  },
  (t) => [index('visits_place_idx').on(t.placeId)]
);

export const anniversaries = mysqlTable('anniversaries', {
  id: id(),
  title: varchar('title', { length: 40 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  kind: mysqlEnum('kind', ['love', 'birthday', 'custom']).notNull().default('custom'),
  lunar: boolean('lunar').notNull().default(false),
  yearly: boolean('yearly').notNull().default(true),
  remind: json('remind').$type<number[]>().notNull().$defaultFn(() => [0]), // 鎻愬墠鍑犲ぉ鎻愰啋
  emoji: varchar('emoji', { length: 16 }),
  createdBy: userRef('created_by'),
  ...timestamps,
});

/**
 * 动态 / 相册里的一项媒体。
 * image：图片本身，或视频 / Live 图的封面；video：视频文件或 Live 图的动态部分。
 */
export type MediaItem = { kind: 'image' | 'video' | 'live'; image?: string | null; video?: string | null; w?: number | null; h?: number | null; duration?: number | null };

export const moments = mysqlTable('moments', {
  id: id(),
  content: text('content'),
  photos: json('photos').$type<string[]>().notNull().$defaultFn(() => []),
  /** 新版媒体（视频 / Live 图）；旧记录为 null，读取时由 photos 补出 */
  media: json('media').$type<MediaItem[]>(),
  mood: varchar('mood', { length: 16 }),
  placeId: varchar('place_id', { length: 36 }).references(() => places.id, { onDelete: 'set null' }),
  createdBy: userRef('created_by'),
  ...timestamps,
});

export const momentLikes = mysqlTable(
  'moment_likes',
  {
    momentId: varchar('moment_id', { length: 36 })
      .notNull()
      .references(() => moments.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.momentId, t.userId] })]
);

export const comments = mysqlTable(
  'comments',
  {
    id: id(),
    momentId: varchar('moment_id', { length: 36 })
      .notNull()
      .references(() => moments.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 500 }).notNull(),
    /** 回复哪条评论（微信朋友圈式的「A 回复 B」） */
    replyToId: varchar('reply_to_id', { length: 36 }),
    /** 图片评论 */
    image: varchar('image', { length: 100 }),
    /** 表情包：内置的 blob:xxx，或自定义表情的文件名 */
    sticker: varchar('sticker', { length: 100 }),
    createdBy: userRef('created_by'),
    ...timestamps,
  },
  (t) => [index('comments_moment_idx').on(t.momentId)]
);

export const todos = mysqlTable('todos', {
  id: id(),
  title: varchar('title', { length: 120 }).notNull(),
  note: text('note'),
  done: boolean('done').notNull().default(false),
  doneAt: datetime('done_at', { fsp: 3 }),
  due: datetime('due', { fsp: 3 }),
  assigneeId: varchar('assignee_id', { length: 36 }),
  category: varchar('category', { length: 20 }),
  createdBy: userRef('created_by'),
  ...timestamps,
});

export const answers = mysqlTable(
  'answers',
  {
    id: id(),
    day: varchar('day', { length: 10 }).notNull(), // YYYY-MM-DD
    question: int('question').notNull(),
    content: text('content').notNull(),
    createdBy: userRef('created_by').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('answers_day_user').on(t.day, t.createdBy)]
);

export const nudges = mysqlTable('nudges', {
  id: id(),
  fromId: varchar('from_id', { length: 36 }).notNull(),
  toId: varchar('to_id', { length: 36 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),
  createdAt: timestamps.createdAt,
});

/** 邮箱验证码（注册 / 找回密码），只存哈希 */
export const emailCodes = mysqlTable(
  'email_codes',
  {
    id: id(),
    email: varchar('email', { length: 191 }).notNull(),
    purpose: mysqlEnum('purpose', ['register', 'reset']).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    attempts: int('attempts').notNull().default(0),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('email_codes_email_idx').on(t.email, t.purpose)]
);

/** 时光胶囊：解锁日之前服务器不会返回内容（包括作者自己） */
export const capsules = mysqlTable(
  'capsules',
  {
    id: id(),
    title: varchar('title', { length: 40 }).notNull(),
    content: text('content').notNull(),
    photos: json('photos').$type<string[]>().notNull().$defaultFn(() => []),
    unlockAt: date('unlock_at', { mode: 'string' }).notNull(),
    /** 已经打开过的人（用来决定是否播放开信动画） */
    openedBy: json('opened_by').$type<string[]>().notNull().$defaultFn(() => []),
    createdBy: userRef('created_by').notNull(),
    ...timestamps,
  },
  (t) => [index('capsules_unlock_idx').on(t.unlockAt)]
);

/** Private food category preferences; null/missing row uses starter categories. */
export const foodPreferences = mysqlTable('food_preferences', {
  userId: varchar('user_id', { length: 36 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  categories: json('categories').$type<string[]>().notNull().$defaultFn(() => []),
});

/** 两个人共用的自定义表情包 */
export const stickers = mysqlTable('stickers', {
  id: id(),
  file: varchar('file', { length: 100 }).notNull(),
  createdBy: userRef('created_by'),
  ...timestamps,
});

/** 共享相册里的照片 / 视频 / Live 图 */
export const galleryItems = mysqlTable(
  'gallery_items',
  {
    id: id(),
    kind: mysqlEnum('kind', ['image', 'video', 'live']).notNull().default('image'),
    /** 展示用图片（视频 / Live 图的封面） */
    image: varchar('image', { length: 100 }),
    video: varchar('video', { length: 100 }),
    /** 原图（下载用）；为空时下载展示图 */
    original: varchar('original', { length: 120 }),
    /** 上传时的文件名，下载时沿用 */
    fileName: varchar('file_name', { length: 200 }),
    width: int('width'),
    height: int('height'),
    duration: double('duration'),
    size: bigint('size', { mode: 'number' }),
    takenAt: datetime('taken_at', { fsp: 3 }).notNull(),
    favorite: boolean('favorite').notNull().default(false),
    createdBy: userRef('created_by'),
    ...timestamps,
  },
  (t) => [index('gallery_taken_idx').on(t.takenAt)]
);

export const albums = mysqlTable('albums', {
  id: id(),
  title: varchar('title', { length: 40 }).notNull(),
  emoji: varchar('emoji', { length: 16 }),
  description: varchar('description', { length: 200 }),
  coverId: varchar('cover_id', { length: 36 }),
  createdBy: userRef('created_by'),
  ...timestamps,
});

export const albumItems = mysqlTable(
  'album_items',
  {
    albumId: varchar('album_id', { length: 36 })
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 36 })
      .notNull()
      .references(() => galleryItems.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.itemId] }), index('album_items_item_idx').on(t.itemId)]
);

/**
 * 「快速上传」：同一个文件（按浏览器算的指纹）上次处理出来的结果。再传同一个文件时，
 * 直接在存储里复制一份处理好的文件，不用重新上传。这只是缓存：文件被删了就当没有，
 * 所以不算「引用」，不会让已经删掉的照片留下来。
 */
export const uploadHashes = mysqlTable(
  'upload_hashes',
  {
    hash: varchar('hash', { length: 100 }).notNull(),
    original: boolean('original').notNull().default(false),
    item: json('item').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [primaryKey({ columns: [t.hash, t.original] })]
);

/** 聊天消息。photo：相册里「给 TA 看」的照片卡片 */
export const messages = mysqlTable(
  'messages',
  {
    id: id(),
    kind: mysqlEnum('kind', ['text', 'image', 'sticker', 'voice', 'photo']).notNull().default('text'),
    content: varchar('content', { length: 1000 }),
    image: varchar('image', { length: 100 }),
    /** 表情包：内置的 blob:xxx，或自定义表情的文件名 */
    sticker: varchar('sticker', { length: 100 }),
    voice: varchar('voice', { length: 100 }),
    duration: double('duration'),
    galleryId: varchar('gallery_id', { length: 36 }).references(() => galleryItems.id, { onDelete: 'set null' }),
    replyToId: varchar('reply_to_id', { length: 36 }),
    createdBy: userRef('created_by'),
    ...timestamps,
  },
  (t) => [index('messages_created_idx').on(t.createdAt)]
);

/** 每个人读到哪里（之后对方发的算未读） */
export const chatReads = mysqlTable('chat_reads', {
  userId: varchar('user_id', { length: 36 }).primaryKey(),
  readAt: datetime('read_at', { fsp: 3 }).notNull(),
});
