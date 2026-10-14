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
}

export interface Moment extends Base {
  content: string | null;
  photos: string[];
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
