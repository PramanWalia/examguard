import { DuplicateEmailError } from '../errors.js';

const normalizeDates = (value, key) => {
  if (value instanceof Date) return value.toISOString();
  if (key === 'answers' && Array.isArray(value)) {
    return Object.fromEntries(value.map((answer) => [answer.itemId, normalizeDates(answer)]));
  }
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, normalizeDates(entry, entryKey)]));
  }
  return value;
};

export const plain = (value) => {
  if (!value) return null;
  const row = value.toObject ? value.toObject() : value;
  return {
    ...normalizeDates(row),
    id: String(row._id ?? row.id),
    createdBy: row.createdBy ? String(row.createdBy) : row.createdBy,
    examId: row.examId ? String(row.examId) : row.examId,
    studentId: row.studentId ? String(row.studentId) : row.studentId,
    questionId: row.questionId ? String(row.questionId) : row.questionId,
    _id: undefined,
  };
};

export const many = (rows) => rows.map(plain);
export const pageMeta = (page, limit, total) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    limit,
    total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
};
export const duplicateEmail = (error) => {
  if (error?.code === 11000) throw new DuplicateEmailError();
  throw error;
};
