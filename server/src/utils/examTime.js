/** Exam lifecycle phase, computed only from server time. */
export const examPhase = (exam, now = new Date()) => {
  if (exam.status !== 'published') return 'draft';
  const time = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (time < new Date(exam.startAt).getTime()) return 'upcoming';
  if (time >= new Date(exam.endAt).getTime()) return 'ended';
  return 'live';
};
