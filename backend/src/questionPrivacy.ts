type Question = { id: string; createdBy: string; askerAnswers: boolean };
type AnswerRow = { questionId: string; createdBy: string; content: string | null };

/** 我需要回答这个问题吗：被问的人一定要答；提问的人选了「我也一起答」才要答 */
export const mustAnswer = (q: Question, userId: string) => q.createdBy !== userId || q.askerAnswers;

/**
 * 对方的答案：我不需要回答，或我已经答了，才能看到；否则内容是 null（只知道 TA 答了）。
 * 自己的答案总是能看到。
 */
export function visibleQuestionAnswers<T extends AnswerRow>(q: Question, rows: T[], userId: string) {
  const answered = rows.some((a) => a.questionId === q.id && a.createdBy === userId);
  const open = answered || !mustAnswer(q, userId);
  return rows.filter((a) => a.questionId === q.id).map((a) => ({ ...a, content: a.createdBy === userId || open ? a.content : null }));
}
