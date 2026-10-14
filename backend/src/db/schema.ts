import { sql } from 'drizzle-orm';
import {
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
  birthday: date('birthday', { mode: 'string' }),
  birthdayLunar: boolean('birthday_lunar').notNull().default(false),
  mood: varchar('mood', { length: 16 }),
  moodText: varchar('mood_text', { length: 60 }),
  moodAt: datetime('mood_at', { fsp: 3 }),
  ...timestamps,
});

export const pushTokens = mysqlTable('push_tokens', {
  token: varchar('token', { length: 191 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const pushReceipts = mysqlTable('push_receipts', {
  id: varchar('id', { length: 191 }).primaryKey(),
  token: varchar('token', { length: 191 }).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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
    note: text('note'),
    cover: varchar('cover', { length: 100 }),
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

export const moments = mysqlTable('moments', {
  id: id(),
  content: text('content'),
  photos: json('photos').$type<string[]>().notNull().$defaultFn(() => []),
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
