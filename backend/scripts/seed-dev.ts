// 本地开发用：两个测试账号 + 示例数据。线上服务器不要运行。
// 用法：npm run seed:dev
import bcrypt from 'bcryptjs';

import { db, pool, runMigrations, schema as s } from '../src/db/index.ts';

const DEV_PASSWORD = 'devpass12345';
await runMigrations();

if ((await db.select({ id: s.users.id }).from(s.users)).length) {
  console.log('数据库里已经有账号，跳过。');
  await pool.end();
  process.exit(0);
}

const hash = await bcrypt.hash(DEV_PASSWORD, 10);
const him = crypto.randomUUID();
const her = crypto.randomUUID();
const now = new Date();
await db.insert(s.users).values([
  { id: him, email: 'him@couple.local', passwordHash: hash, name: '阿北', mood: '😋', moodText: '想吃火锅', moodAt: now, birthday: '2000-04-11', birthdayLunar: true },
  { id: her, email: 'her@couple.local', passwordHash: hash, name: '小南', mood: '🥰', moodText: '今天也很开心', moodAt: now, birthday: '2001-11-02' },
]);

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await db.insert(s.space).values({ id: 1, startDate: day(812), title: '阿北 & 小南' });

const p = Array.from({ length: 5 }, () => crypto.randomUUID());
await db.insert(s.places).values([
  { id: p[0], name: '湊湊火锅', category: '火锅', status: 'visited', rating: 4.5, price: 158, address: '南京西路 1266 号恒隆广场 5F', city: '上海', lat: 31.2286, lng: 121.4527, note: '毛肚一定要点！奶茶锅底很好喝', createdBy: him },
  { id: p[1], name: 'Mercato', category: '西餐', status: 'visited', rating: 5, price: 320, address: '中山东一路 3 号外滩三号 6F', city: '上海', lat: 31.2365, lng: 121.4904, note: '纪念日吃的，看得到外滩夜景', createdBy: her },
  { id: p[2], name: '老吉士酒家', category: '本帮菜', status: 'want', price: 180, address: '天平路 41 号', city: '上海', lat: 31.2063, lng: 121.4405, xhsUrl: 'https://www.xiaohongshu.com/explore/demo', note: '想吃红烧肉、蟹粉豆腐', createdBy: her },
  { id: p[3], name: '鮨 · 一', category: '日料', status: 'want', price: 680, address: '富民路 108 号', city: '上海', lat: 31.2218, lng: 121.4512, createdBy: him },
  { id: p[4], name: 'Manner 咖啡', category: '咖啡', status: 'visited', rating: 4, price: 25, address: '南阳路 99 号', city: '上海', lat: 31.2312, lng: 121.4583, createdBy: her },
]);

await db.insert(s.visits).values([
  { placeId: p[0], date: day(12), rating: 4.5, note: '排了一小时，值得', dishes: [{ name: '招牌毛肚', liked: true }, { name: '台式奶茶锅底', liked: true }, { name: '虾滑', liked: false }], createdBy: him },
  { placeId: p[1], date: day(40), rating: 5, note: '两周年快乐', dishes: [{ name: '松露意面', liked: true }, { name: '提拉米苏', liked: true }], createdBy: her },
]);

await db.insert(s.anniversaries).values([
  { title: '在一起', date: day(812), kind: 'love', remind: [0, 3], emoji: '💞', createdBy: her },
  { title: '小南生日', date: '2001-11-02', kind: 'birthday', remind: [0, 1, 7], emoji: '🎂', createdBy: him },
  { title: '阿北生日', date: '2000-03-15', kind: 'birthday', lunar: true, remind: [0, 7], emoji: '🎁', createdBy: her },
  { title: '第一次旅行', date: day(500), kind: 'custom', remind: [0], emoji: '✈️', createdBy: him },
]);

const m1 = crypto.randomUUID();
await db.insert(s.moments).values([
  { id: m1, content: '今天终于吃到了念念不忘的毛肚 🥹 排队一小时也值得', mood: '😋', placeId: p[0], createdBy: him, createdAt: new Date(Date.now() - 3 * 3600e3) },
  { content: '下雨天，窝在家里看了一整天电影。\n有你在就很好。', mood: '🌧️', createdBy: her, createdAt: new Date(Date.now() - 26 * 3600e3) },
]);
await db.insert(s.momentLikes).values({ momentId: m1, userId: her });
await db.insert(s.comments).values({ momentId: m1, content: '下次还要去！', createdBy: her });

await db.insert(s.todos).values([
  { title: '订周六的电影票', category: '约会', assigneeId: him, due: new Date(Date.now() + 2 * 864e5), createdBy: her },
  { title: '买猫粮', category: '生活', assigneeId: her, createdBy: her },
  { title: '规划国庆旅行路线', category: '旅行', createdBy: him },
  { title: '交房租', category: '生活', done: true, doneAt: now, createdBy: him },
]);

await db.insert(s.capsules).values([
  { title: '两周年的时候再看', content: '如果你在读这封信，说明我们已经在一起两年啦。\n谢谢你一直在。', unlockAt: day(-1), createdBy: her },
  { title: '写给一年后的我们', content: '希望那时候我们已经去过了好多好多家想去的店。', unlockAt: day(-200), createdBy: him },
]);

console.log('示例数据已创建：him@couple.local / her@couple.local（密码见 scripts/seed-dev.ts）');
await pool.end();
