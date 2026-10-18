import type { Place, Visit } from './types';

/** 卡片 / 预览用的图：自己选的封面 > 我们探店拍的照片 > 高德上的店铺照片 */
export function placeCover(p: Place, visits: Visit[] = []) {
  return p.cover ?? visits.find((v) => v.placeId === p.id && v.photos.length)?.photos[0] ?? null;
}

export type PlaceImage = { kind: 'file'; name: string } | { kind: 'url'; url: string } | null;
export function placeImage(p: Place, visits: Visit[] = []): PlaceImage {
  const own = placeCover(p, visits);
  if (own) return { kind: 'file', name: own };
  if (p.amapPhoto) return { kind: 'url', url: p.amapPhoto };
  return null;
}

/**
 * 菜系识别：用户新加的类型（比如「私房菜」「螺蛳粉」「泰式按摩前的那家」）也能配上合适的图和颜色。
 * 按顺序匹配关键词，越具体的放越前面。
 */
type Tone = 'rose' | 'apricot' | 'sand' | 'sage' | 'sky' | 'lilac' | 'cocoa';
const RULES: [RegExp, string, Tone][] = [
  [/火锅|涮|串串|冒菜|麻辣烫|毛肚|铜锅/, '🍲', 'rose'],
  [/烧烤|烤串|撸串|烤肉|炙子|bbq/i, '🍢', 'apricot'],
  [/寿司|刺身|日料|日本|居酒屋|天妇罗|鳗鱼|丼|和食|烧鸟/, '🍣', 'sky'],
  [/韩|部队锅|炸鸡|石锅|拌饭|年糕/, '🥘', 'apricot'],
  [/披萨|比萨|pizza/i, '🍕', 'apricot'],
  [/汉堡|快餐|麦当劳|肯德基|burger/i, '🍔', 'sand'],
  [/牛排|西餐|法餐|意餐|意面|意大利|西班牙|brunch/i, '🍝', 'lilac'],
  [/早午餐|早餐|早茶|吐司|贝果|松饼|班尼迪克/, '🥞', 'sand'],
  [/咖啡|拿铁|cafe|coffee/i, '☕️', 'cocoa'],
  [/奶茶|茶饮|果茶|柠檬茶|喜茶|奈雪|霸王/, '🧋', 'cocoa'],
  [/茶馆|茶室|喝茶|早茶点心/, '🍵', 'sage'],
  [/酒吧|小酒馆|精酿|鸡尾酒|清吧|威士忌|bar/i, '🍸', 'lilac'],
  [/啤酒|大排档|夜宵/, '🍺', 'sand'],
  [/甜品|蛋糕|甜点|面包|烘焙|糕点|西点|马卡龙|泡芙/, '🍰', 'rose'],
  [/冰淇淋|雪糕|冰激凌|gelato|冰室/i, '🍦', 'sky'],
  [/糖水|双皮奶|豆花|芋圆|龟苓膏/, '🥣', 'rose'],
  [/酸菜鱼|水煮鱼|烤鱼|毛血旺|麻辣香锅/, '🌶️', 'rose'],
  [/海鲜|生蚝|蟹|虾|鱼|水产|小龙虾/, '🦐', 'sky'],
  [/粤|港式|茶餐厅|烧腊|肠粉|潮汕|客家|广式/, '🦐', 'sky'],
  [/川|湘|重庆|麻辣|辣|江湖菜|贵州|酸汤|云南|傣/, '🌶️', 'rose'],
  [/东南亚|泰|越南|冬阴功|咖喱|印度|马来|新加坡|印尼/, '🍛', 'sage'],
  [/螺蛳粉|米粉|米线|粉面|酸辣粉|桂林/, '🍜', 'apricot'],
  [/面|拉面|牛肉面|面馆|刀削|油泼|担担/, '🍜', 'apricot'],
  [/饺|馄饨|包子|小笼|生煎|锅贴|点心|烧卖/, '🥟', 'sand'],
  [/粥|砂锅|煲/, '🍚', 'sand'],
  [/小吃|街边|夜市|煎饼|卷饼|肉夹馍/, '🥡', 'sand'],
  [/烤鸭|北京|京菜|鲁菜|东北|锅包肉/, '🦆', 'apricot'],
  [/本帮|杭帮|江浙|淮扬|上海|苏帮|徽菜|私房|家常|农家|土菜/, '🥢', 'sage'],
  [/素食|轻食|沙拉|健康|素菜|vegan|salad/i, '🥗', 'sage'],
  [/鸡|鸭|鹅/, '🍗', 'apricot'],
  [/羊|牛|肉|烤全/, '🥩', 'rose'],
  [/寿喜|铁板|烧肉/, '🥩', 'apricot'],
  [/水果|果切|榴莲/, '🍓', 'rose'],
  [/自助|buffet/i, '🍽️', 'lilac'],
];

function match(c?: string | null) {
  if (!c) return null;
  return RULES.find(([re]) => re.test(c)) ?? null;
}

export const categoryEmoji = (c?: string | null) => match(c)?.[1] ?? '🍽️';

/** 内置的几个推荐类型（用户可以自己加更多） */
export const CATEGORIES = ['火锅', '日料', '西餐', '咖啡', '甜品', '烧烤', '本帮菜', '川菜', '粤菜', '韩料', '东南亚', '面', '小吃', '酒吧', '早午餐'];

/** 卡片底色：菜系识别出来的颜色；识别不了的按名字分配，同一家店颜色固定 */
const TONES: Record<Tone, { bg: string; ink: string }> = {
  rose: { bg: '#FBE3E9', ink: '#B04468' },
  apricot: { bg: '#FCE8D8', ink: '#A0562C' },
  sand: { bg: '#F4ECD5', ink: '#856A22' },
  sage: { bg: '#E2EEE0', ink: '#4D7748' },
  sky: { bg: '#E1EBF5', ink: '#46688A' },
  lilac: { bg: '#ECE5F5', ink: '#6C5492' },
  cocoa: { bg: '#EFE5DC', ink: '#7A5640' },
};
export function categoryTone(key?: string | null) {
  const m = match(key);
  if (m) return TONES[m[2]];
  const names = Object.keys(TONES) as Tone[];
  let h = 0;
  for (const ch of key ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[names[h % names.length]];
}

/** 从名字算一个稳定的小数，用来决定拍立得的倾斜角度、胶带颜色等，刷新也不会变 */
export function stableRandom(key: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** 地址里的区 / 商圈，让同一个城市的两家店也分得开 */
export function placeArea(p: Place) {
  const m = p.address?.match(/([^省市\s]{1,6}(区|县|镇))/);
  return m?.[1] ?? null;
}

/** 存进数据库的高德照片（太长的地址存不下，换下一张） */
export const firstAmapPhoto = (place: { photos: { url: string }[] }) => place.photos.find((x) => x.url.length <= 600)?.url ?? '';

/** 搜索：店名、地址、城市、类型、备注，以及吃过时记下的菜和探店备注；空格分开的几个词都要命中 */
export function matchesQuery(p: Place, query: string, visits: Visit[] = []) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const mine = visits.filter((v) => v.placeId === p.id);
  const text = [p.name, p.address, p.city, p.category, p.note, ...mine.flatMap((v) => [v.note, ...(v.dishes ?? []).map((d) => d.name)])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return words.every((w) => text.includes(w));
}
