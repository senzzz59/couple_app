import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryEmoji, categoryTone, placeArea, stableRandom } from '../../frontend/src/lib/food.ts';

test('custom food categories are recognised by keyword', () => {
  const cases: [string, string][] = [
    ['火锅', '🍲'], ['潮汕牛肉火锅', '🍲'], ['日料', '🍣'], ['居酒屋', '🍣'], ['兰州拉面', '🍜'], ['螺蛳粉', '🍜'],
    ['私房菜', '🥢'], ['杭帮菜', '🥢'], ['酸菜鱼', '🌶️'], ['生蚝', '🦐'], ['手冲咖啡', '☕️'], ['奶茶', '🧋'],
    ['精酿酒吧', '🍸'], ['法式甜品', '🍰'], ['面包店', '🍰'], ['泰餐', '🍛'], ['轻食沙拉', '🥗'], ['东北菜', '🦆'],
  ];
  for (const [name, emoji] of cases) assert.equal(categoryEmoji(name), emoji, name);
  assert.equal(categoryEmoji('完全不认识的东西'), '🍽️');
  assert.equal(categoryEmoji(null), '🍽️');
});

test('tones and card randomness are stable for the same input', () => {
  assert.deepEqual(categoryTone('火锅'), categoryTone('串串香'));
  assert.deepEqual(categoryTone('某家神秘小店'), categoryTone('某家神秘小店'));
  assert.equal(stableRandom('巷子里的拉面', 1), stableRandom('巷子里的拉面', 1));
  assert.ok(stableRandom('a') >= 0 && stableRandom('a') < 1);
  assert.equal(placeArea({ address: '上海市徐汇区天平路 1 号' } as never), '徐汇区');
  assert.equal(placeArea({ address: null } as never), null);
});

test('food search matches place fields and dishes from our visits; every word must match', async () => {
  const { matchesQuery } = await import('../../frontend/src/lib/food.ts');
  const place = { id: 'p1', name: '益阳饭店', address: '北滘镇林头市场', city: '佛山', category: '湘菜', note: null } as never;
  const other = { id: 'p2', name: '面馆', address: null, city: '广州', category: '面', note: '牛肉面' } as never;
  const visits = [{ placeId: 'p1', note: '辣得过瘾', dishes: [{ name: '小龙虾' }] }] as never;
  assert.ok(matchesQuery(place, '益阳', visits));
  assert.ok(matchesQuery(place, '小龙虾', visits));
  assert.ok(matchesQuery(place, '辣得', visits));
  assert.ok(matchesQuery(place, '湘菜 林头', visits));
  assert.ok(!matchesQuery(place, '湘菜 广州', visits));
  assert.ok(!matchesQuery(other, '小龙虾', visits), "another place's dishes do not count");
  assert.ok(matchesQuery(other, '牛肉', visits));
  assert.ok(matchesQuery(other, '  ', visits));
  assert.ok(matchesQuery({ id: 'x', name: 'Starbucks' } as never, 'starBUCKS'));
});
