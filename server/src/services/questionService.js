import { parseInput } from '../validators/common.js';
import { questionSchema } from '../validators/question.js';
import { forbidden, notFound } from '../utils/errors.js';

const EDITABLE_FIELDS = [
  'subject',
  'topic',
  'difficulty',
  'type',
  'prompt',
  'options',
  'correctOptionIds',
  'numericAnswer',
  'explanation',
  'defaultMarks',
  'negativeMarks',
];

const pick = (question) =>
  Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, question[field]]));

const assertManage = (user, question) => {
  if (user.role !== 'admin' && question.createdBy !== user.id) {
    throw forbidden('This question belongs to another teacher.');
  }
};

export const listQuestions = async (questionRepo, user, query) => {
  // Teachers only ever see their own bank; admins see every question.
  const filters = user.role === 'admin' ? {} : { createdBy: user.id };
  return questionRepo.list({ ...filters, ...query });
};

export const getQuestion = async (questionRepo, user, id) => {
  const question = await questionRepo.findById(id);
  if (!question) throw notFound('Question not found.');
  assertManage(user, question);
  return question;
};

export const createQuestion = async (questionRepo, user, input) =>
  questionRepo.create({ ...input, createdBy: user.id });

export const updateQuestion = async (questionRepo, user, id, patch) => {
  const existing = await questionRepo.findById(id);
  if (!existing) throw notFound('Question not found.');
  assertManage(user, existing);

  // Full validation after the merge, so a partial patch cannot leave an
  // invalid question (e.g. change type to numeric without numericAnswer).
  const merged = parseInput(questionSchema, { ...pick(existing), ...patch });
  const updated = await questionRepo.updateById(id, merged);
  if (!updated) throw notFound('Question not found.');
  return updated;
};

export const deleteQuestion = async (questionRepo, examRepo, user, id) => {
  const existing = await questionRepo.findById(id);
  if (!existing) throw notFound('Question not found.');
  assertManage(user, existing);

  // A referenced question keeps its published snapshots alive; archive instead
  // of removing the row the draft still points at.
  if (await examRepo.isQuestionReferenced(id)) {
    await questionRepo.archiveById(id);
  } else {
    await questionRepo.deleteById(id);
  }
  return { id, deleted: true };
};
