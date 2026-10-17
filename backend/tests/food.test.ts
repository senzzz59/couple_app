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
