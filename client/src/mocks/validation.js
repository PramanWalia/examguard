const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const BATCH_ID = /^[A-Za-z0-9_-]{1,40}$/;
const JOIN_CODE = /^[A-Z0-9-]{4,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isObjectId = (value) => typeof value === 'string' && OBJECT_ID.test(value);
export const isBatchId = (value) => typeof value === 'string' && BATCH_ID.test(value);
export const isEmail = (value) => typeof value === 'string' && EMAIL.test(value.trim());
export const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

const stringLength = (value) => (typeof value === 'string' ? value.trim().length : -1);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export const validateObjectId = (value, path, errors) => {
  if (!isObjectId(value)) errors.push({ path, message: 'Must be a valid 24-character id.' });
};

export const validatePagination = (searchParams) => {
  const errors = [];
  const page = Number(searchParams.get('page') || 1);
  const limit = Number(searchParams.get('limit') || 20);
  if (!Number.isInteger(page) || page < 1) errors.push({ path: 'page', message: 'Must be an integer >= 1.' });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.push({ path: 'limit', message: 'Must be an integer between 1 and 100.' });
  }
  return { page: Math.max(1, page), limit: Math.min(100, Math.max(1, limit)), errors };
};

export const paginate = (items, page, limit) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    rows: items.slice((safePage - 1) * limit, safePage * limit),
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
  };
};

const validateOptions = (body, errors) => {
  const { options, correctOptionIds, type } = body;
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    errors.push({ path: 'options', message: 'Choice questions need 2–6 options.' });
    return;
  }
  const ids = new Set();
  options.forEach((option, index) => {
    if (!isObjectIdLike(option?.id)) {
      errors.push({ path: `options.${index}.id`, message: 'Option id must be 1–8 lowercase letters/numbers.' });
    }
    if (ids.has(option?.id)) {
      errors.push({ path: `options.${index}.id`, message: 'Option ids must be unique.' });
    }
    ids.add(option?.id);
    if (stringLength(option?.text) < 1 || stringLength(option?.text) > 500) {
      errors.push({ path: `options.${index}.text`, message: 'Option text must be 1–500 characters.' });
    }
  });

  if (!Array.isArray(correctOptionIds)) {
    errors.push({ path: 'correctOptionIds', message: 'Correct options are required.' });
    return;
  }
  const unique = new Set(correctOptionIds);
  if (unique.size !== correctOptionIds.length) {
    errors.push({ path: 'correctOptionIds', message: 'Correct options must be unique.' });
  }
  if (type === 'single_choice' && correctOptionIds.length !== 1) {
    errors.push({ path: 'correctOptionIds', message: 'Single choice needs exactly one correct option.' });
  }
  if (type === 'multiple_choice' && correctOptionIds.length < 1) {
    errors.push({ path: 'correctOptionIds', message: 'Multiple choice needs at least one correct option.' });
  }
  correctOptionIds.forEach((id) => {
    if (!ids.has(id)) errors.push({ path: 'correctOptionIds', message: 'Correct options must reference an option.' });
  });
};

const isObjectIdLike = (value) => typeof value === 'string' && /^[a-z0-9]{1,8}$/.test(value);

export const validateQuestion = (body) => {
  const errors = [];
  if (stringLength(body.subject) < 1 || stringLength(body.subject) > 80) {
    errors.push({ path: 'subject', message: 'Subject must be 1–80 characters.' });
  }
  if (stringLength(body.topic) < 1 || stringLength(body.topic) > 80) {
    errors.push({ path: 'topic', message: 'Topic must be 1–80 characters.' });
  }
  if (!['easy', 'medium', 'hard'].includes(body.difficulty)) {
    errors.push({ path: 'difficulty', message: 'Choose easy, medium, or hard.' });
  }
  if (!['single_choice', 'multiple_choice', 'numeric'].includes(body.type)) {
    errors.push({ path: 'type', message: 'Choose single choice, multiple choice, or numeric.' });
  }
  if (stringLength(body.prompt) < 5 || stringLength(body.prompt) > 2000) {
    errors.push({ path: 'prompt', message: 'Prompt must be 5–2000 characters.' });
  }
  if (body.explanation !== undefined && stringLength(body.explanation) > 2000) {
    errors.push({ path: 'explanation', message: 'Explanation must be at most 2000 characters.' });
  }
  if (!isNumber(body.defaultMarks) || body.defaultMarks < 0 || body.defaultMarks > 100) {
    errors.push({ path: 'defaultMarks', message: 'Default marks must be between 0 and 100.' });
  }
  if (!isNumber(body.negativeMarks) || body.negativeMarks < 0 || body.negativeMarks > 100) {
    errors.push({ path: 'negativeMarks', message: 'Negative marks must be between 0 and 100.' });
  } else if (isNumber(body.defaultMarks) && body.negativeMarks > body.defaultMarks) {
    errors.push({ path: 'negativeMarks', message: 'Negative marks cannot exceed default marks.' });
  }

  if (body.type === 'numeric') {
    if (!isNumber(body.numericAnswer)) {
      errors.push({ path: 'numericAnswer', message: 'A finite numeric answer is required.' });
    }
    if (Array.isArray(body.options) && body.options.length > 0) {
      errors.push({ path: 'options', message: 'Numeric questions cannot have options.' });
    }
    if (Array.isArray(body.correctOptionIds) && body.correctOptionIds.length > 0) {
      errors.push({ path: 'correctOptionIds', message: 'Numeric questions cannot have correct option ids.' });
    }
  } else if (['single_choice', 'multiple_choice'].includes(body.type)) {
    validateOptions(body, errors);
    if (body.numericAnswer !== null && body.numericAnswer !== undefined) {
      errors.push({ path: 'numericAnswer', message: 'Choice questions cannot have a numeric answer.' });
    }
  }

  return errors;
};

export const validateExam = (body, { partial = false } = {}) => {
  const errors = [];
  const has = (key) => body[key] !== undefined;

  if ((!partial || has('title')) && (stringLength(body.title) < 3 || stringLength(body.title) > 150)) {
    errors.push({ path: 'title', message: 'Title must be 3–150 characters.' });
  }
  if (has('description') && stringLength(body.description) > 2000) {
    errors.push({ path: 'description', message: 'Description must be at most 2000 characters.' });
  }
  if ((!partial || has('durationMinutes')) && (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 480)) {
    errors.push({ path: 'durationMinutes', message: 'Duration must be an integer between 1 and 480.' });
  }
  if (!partial || has('startAt') || has('endAt')) {
    if (!isIsoDate(body.startAt)) errors.push({ path: 'startAt', message: 'Start time must be a valid ISO date.' });
    if (!isIsoDate(body.endAt)) errors.push({ path: 'endAt', message: 'End time must be a valid ISO date.' });
    if (isIsoDate(body.startAt) && isIsoDate(body.endAt) && new Date(body.startAt) >= new Date(body.endAt)) {
      errors.push({ path: 'endAt', message: 'End time must be after start time.' });
    }
    if (isIsoDate(body.endAt) && new Date(body.endAt) <= new Date()) {
      errors.push({ path: 'endAt', message: 'End time must be in the future.' });
    }
  }
  if (has('resultMode') && !['immediate', 'after_end', 'manual'].includes(body.resultMode)) {
    errors.push({ path: 'resultMode', message: 'Choose immediate, after_end, or manual.' });
  }
  if (has('settings')) {
    const settings = body.settings || {};
    if (settings.shuffleQuestions !== undefined && typeof settings.shuffleQuestions !== 'boolean') {
      errors.push({ path: 'settings.shuffleQuestions', message: 'Must be a boolean.' });
    }
    if (settings.shuffleOptions !== undefined && typeof settings.shuffleOptions !== 'boolean') {
      errors.push({ path: 'settings.shuffleOptions', message: 'Must be a boolean.' });
    }
    if (settings.passPercentage !== undefined && (!isNumber(settings.passPercentage) || settings.passPercentage < 0 || settings.passPercentage > 100)) {
      errors.push({ path: 'settings.passPercentage', message: 'Must be between 0 and 100.' });
    }
    if (settings.violationLimit !== undefined && (!Number.isInteger(settings.violationLimit) || settings.violationLimit < 0 || settings.violationLimit > 1000)) {
      errors.push({ path: 'settings.violationLimit', message: 'Must be an integer between 0 and 1000.' });
    }
    if (settings.autoSubmitOnViolation !== undefined && typeof settings.autoSubmitOnViolation !== 'boolean') {
      errors.push({ path: 'settings.autoSubmitOnViolation', message: 'Must be a boolean.' });
    }
  }
  if (has('assignment')) {
    const assignment = body.assignment || {};
    if (assignment.batchIds !== undefined) {
      if (!Array.isArray(assignment.batchIds)) {
        errors.push({ path: 'assignment.batchIds', message: 'Must be an array of batch ids.' });
      } else {
        if (assignment.batchIds.length > 50) errors.push({ path: 'assignment.batchIds', message: 'At most 50 batches.' });
        const unique = new Set(assignment.batchIds);
        if (unique.size !== assignment.batchIds.length) errors.push({ path: 'assignment.batchIds', message: 'Batch ids must be unique.' });
        assignment.batchIds.forEach((batchId) => {
          if (!isBatchId(batchId)) errors.push({ path: 'assignment.batchIds', message: `Invalid batch id: ${batchId}` });
        });
      }
    }
    if (assignment.joinCodeEnabled !== undefined && typeof assignment.joinCodeEnabled !== 'boolean') {
      errors.push({ path: 'assignment.joinCodeEnabled', message: 'Must be a boolean.' });
    }
  }
  if (has('items')) {
    if (!Array.isArray(body.items)) {
      errors.push({ path: 'items', message: 'Items must be an array.' });
    } else {
      if (body.items.length > 200) errors.push({ path: 'items', message: 'At most 200 items.' });
      body.items.forEach((item, index) => {
        if (!isObjectId(item?.questionId)) errors.push({ path: `items.${index}.questionId`, message: 'Invalid question id.' });
        if (item?.marks !== undefined && (!isNumber(item.marks) || item.marks < 0 || item.marks > 100)) {
          errors.push({ path: `items.${index}.marks`, message: 'Marks must be 0–100.' });
        }
        if (item?.negativeMarks !== undefined && (!isNumber(item.negativeMarks) || item.negativeMarks < 0 || item.negativeMarks > 100)) {
          errors.push({ path: `items.${index}.negativeMarks`, message: 'Negative marks must be 0–100.' });
        }
        if (isNumber(item?.marks) && isNumber(item?.negativeMarks) && item.negativeMarks > item.marks) {
          errors.push({ path: `items.${index}.negativeMarks`, message: 'Negative marks cannot exceed marks.' });
        }
      });
    }
  }

  return errors;
};

export const validateAnswer = (body, item) => {
  const errors = [];
  validateObjectId(body.itemId, 'itemId', errors);
  if (!Number.isInteger(body.clientSeq) || body.clientSeq < 1) {
    errors.push({ path: 'clientSeq', message: 'clientSeq must be an integer >= 1.' });
  }
  const hasAnswer =
    body.selectedOptionIds !== undefined || body.numericValue !== undefined || body.markedForReview !== undefined;
  if (!hasAnswer) errors.push({ path: 'answer', message: 'Provide an answer or mark the question for review.' });

  if (body.selectedOptionIds !== undefined) {
    if (!Array.isArray(body.selectedOptionIds) || body.selectedOptionIds.length > 6) {
      errors.push({ path: 'selectedOptionIds', message: 'Provide at most 6 option ids.' });
    } else if (new Set(body.selectedOptionIds).size !== body.selectedOptionIds.length) {
      errors.push({ path: 'selectedOptionIds', message: 'Option ids must be unique.' });
    } else if (item?.question.type === 'single_choice' && body.selectedOptionIds.length > 1) {
      errors.push({ path: 'selectedOptionIds', message: 'Single choice accepts one option.' });
    } else if (item && !body.selectedOptionIds.every((id) => item.question.options.some((option) => option.id === id))) {
      errors.push({ path: 'selectedOptionIds', message: 'That option does not belong to this question.' });
    }
  }

  if (body.numericValue !== undefined && body.numericValue !== null) {
    if (!isNumber(body.numericValue)) errors.push({ path: 'numericValue', message: 'Enter a finite number.' });
    if (item && item.question.type !== 'numeric') errors.push({ path: 'numericValue', message: 'This is not a numeric question.' });
  }
  if (body.markedForReview !== undefined && typeof body.markedForReview !== 'boolean') {
    errors.push({ path: 'markedForReview', message: 'Must be a boolean.' });
  }
  return errors;
};

export const validateViolation = (body) => {
  const errors = [];
  const types = ['tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'context_menu', 'shortcut', 'other'];
  if (!types.includes(body.type)) errors.push({ path: 'type', message: 'Unknown violation type.' });
  if (body.meta !== undefined) {
    if (typeof body.meta !== 'object' || body.meta === null || Array.isArray(body.meta)) {
      errors.push({ path: 'meta', message: 'Meta must be a JSON object.' });
    } else if (JSON.stringify(body.meta).length > 2048) {
      errors.push({ path: 'meta', message: 'Meta must be at most 2 KB.' });
    }
  }
  return errors;
};

export const validateRegister = (body) => {
  const errors = [];
  if (stringLength(body.name) < 2 || stringLength(body.name) > 80) {
    errors.push({ path: 'name', message: 'Name must be 2–80 characters.' });
  }
  if (!isEmail(body.email)) errors.push({ path: 'email', message: 'Enter a valid email address.' });
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72) {
    errors.push({ path: 'password', message: 'Password must be 8–72 characters.' });
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.push({ path: 'password', message: 'Password needs at least one letter and one number.' });
  }
  if (body.role !== undefined && !['student', 'teacher'].includes(body.role)) {
    errors.push({ path: 'role', message: 'Self-registration only allows student or teacher.' });
  }
  return errors;
};

export const validateUserPatch = (body) => {
  const errors = [];
  const keys = Object.keys(body || {});
  if (keys.length === 0) errors.push({ path: 'body', message: 'Provide at least one field.' });
  const forbidden = ['email', 'password', 'passwordHash', 'accessToken'];
  forbidden.forEach((key) => {
    if (keys.includes(key)) errors.push({ path: key, message: 'This field cannot be changed here.' });
  });
  if (body.name !== undefined && (stringLength(body.name) < 2 || stringLength(body.name) > 80)) {
    errors.push({ path: 'name', message: 'Name must be 2–80 characters.' });
  }
  if (body.role !== undefined && !['admin', 'teacher', 'student'].includes(body.role)) {
    errors.push({ path: 'role', message: 'Invalid role.' });
  }
  if (body.batchIds !== undefined) {
    if (!Array.isArray(body.batchIds) || body.batchIds.length > 50) {
      errors.push({ path: 'batchIds', message: 'Provide at most 50 batch ids.' });
    } else if (new Set(body.batchIds).size !== body.batchIds.length) {
      errors.push({ path: 'batchIds', message: 'Batch ids must be unique.' });
    } else if (!body.batchIds.every(isBatchId)) {
      errors.push({ path: 'batchIds', message: 'Invalid batch id.' });
    }
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push({ path: 'isActive', message: 'Must be a boolean.' });
  }
  return errors;
};

export const validateJoinCode = (value) =>
  typeof value === 'string' && JOIN_CODE.test(value.trim().toUpperCase());
