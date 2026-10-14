export function visibleAnswers<T extends { day: string; createdBy: string; content: string }>(rows: T[], userId: string) {
  const answered = new Set(rows.filter((a) => a.createdBy === userId).map((a) => a.day));
  return rows.map((a) => ({ ...a, content: a.createdBy === userId || answered.has(a.day) ? a.content : null }));
}
