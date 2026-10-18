import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickCovers } from '../src/monthCovers.ts';
import { mustAnswer, visibleQuestionAnswers } from '../src/questionPrivacy.ts';

const rows = (qid: string) => [
  { questionId: qid, createdBy: 'asker', content: 'asker says' },
  { questionId: qid, createdBy: 'partner', content: 'partner says' },
  { questionId: 'other', createdBy: 'partner', content: 'elsewhere' },
];

test('both people answer: the other answer stays hidden until you answered', () => {
  const q = { id: 'q1', createdBy: 'asker', askerAnswers: true };
  const onlyAsker = rows('q1').filter((r) => r.createdBy === 'asker');
  // 被问的人还没答：看不到提问人的答案
  assert.deepEqual(visibleQuestionAnswers(q, onlyAsker, 'partner').map((a) => a.content), [null]);
  // 两个人都答了：都看得到；别的问题的答案不混进来
  assert.deepEqual(visibleQuestionAnswers(q, rows('q1'), 'partner').map((a) => a.content), ['asker says', 'partner says']);
  const onlyPartner = rows('q1').filter((r) => r.createdBy === 'partner');
  assert.deepEqual(visibleQuestionAnswers(q, onlyPartner, 'asker').map((a) => a.content), [null]);
});

test('asker who only asks sees the answer right away and does not need to answer', () => {
  const q = { id: 'q1', createdBy: 'asker', askerAnswers: false };
  assert.equal(mustAnswer(q, 'asker'), false);
  assert.equal(mustAnswer(q, 'partner'), true);
  const onlyPartner = rows('q1').filter((r) => r.createdBy === 'partner');
  assert.deepEqual(visibleQuestionAnswers(q, onlyPartner, 'asker').map((a) => a.content), ['partner says']);
});

test('month covers prefer favourites and spread across the month', () => {
  assert.deepEqual(pickCovers(['f1'], ['a', 'b', 'c', 'd', 'e', 'f']), ['f1', 'a', 'c', 'e']);
  assert.deepEqual(pickCovers([], ['a']), ['a']);
  assert.equal(pickCovers(['1', '2', '3', '4', '5'], ['x']).length, 4);
});
