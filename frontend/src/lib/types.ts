export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  gender: 'male' | 'female' | null;
  birthday: string | null;
  birthdayLunar: boolean;
  mood: string | null;
  moodText: string | null;
  moodAt: string | null;
}

export interface Space {
  id: number;
  startDate: string | null;
  title: string | null;
}

interface Base {
  id: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlaceStatus = 'want' | 'visited';

export interface Place extends Base {
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  status: PlaceStatus;
  rating: number | null;
  price: number | null;
  xhsUrl: string | null;
  amapUrl: string | null;
  note: string | null;
  cover: string | null;
}

export interface Dish {
  name: string;
  liked?: boolean;
}

export interface Visit extends Base {
  placeId: string;
  date: string;
  photos: string[];
  dishes: Dish[];
  rating: number | null;
  note: string | null;
}

export interface Anniversary extends Base {
  title: string;
  date: string;
  kind: 'love' | 'birthday' | 'custom';
  lunar: boolean;
  yearly: boolean;
  remind: number[];
  emoji: string | null;
}

export interface Comment extends Base {
  momentId: string;
  content: string;
  /** 回复的那条评论 */
  replyToId?: string | null;
  image?: string | null;
  /** 内置表情 blob:xxx 或自定义表情文件名 */
  sticker?: string | null;
}

/** 动态 / 相册里的一项媒体：image 是图片或视频封面，video 是视频或 Live 图的动态部分 */
export interface MediaItem {
  kind: 'image' | 'video' | 'live';
  image?: string | null;
  video?: string | null;
  w?: number | null;
  h?: number | null;
  duration?: number | null;
}

export interface GalleryItem extends Base {
  kind: 'image' | 'video' | 'live';
  image: string | null;
  video: string | null;
  original: string | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  size: number | null;
  takenAt: string;
  favorite: boolean;
}

export interface Album extends Base {
  title: string;
  emoji: string | null;
  description: string | null;
  coverId: string | null;
  count: number;
  cover: GalleryItem | null;
}

export interface GallerySummary {
  total: number;
  videos: number;
  live: number;
  favorites: number;
  latest: GalleryItem[];
  covers: { favorites: GalleryItem | null; videos: GalleryItem | null; live: GalleryItem | null };
}

export interface Sticker extends Base {
  file: string;
}

export interface Moment extends Base {
  content: string | null;
  photos: string[];
  /** 服务器统一返回（旧动态由 photos 转换） */
  media?: MediaItem[];
  mood: string | null;
  placeId: string | null;
  likedBy: string[];
  comments: Comment[];
}

export interface Todo extends Base {
  title: string;
  note: string | null;
  done: boolean;
  doneAt: string | null;
  due: string | null;
  assigneeId: string | null;
  category: string | null;
}

/** 未解锁时 content 为 null、photos 为空，只有 letterLength / photoCount */
export interface Capsule {
  id: string;
  title: string;
  unlockAt: string;
  createdBy: string;
  createdAt: string;
  openedBy: string[];
  locked: boolean;
  letterLength: number;
  photoCount: number;
  content: string | null;
  photos: string[];
}

export interface Answer extends Base {
  day: string;
  question: number;
  content: string | null;
}
