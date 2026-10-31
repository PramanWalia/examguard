import XLSX from 'xlsx';

import { AppError } from '../utils/errors.js';
import { questionSchema, requiredImportHeaders } from '../validators/question.js';
import { zodDetails } from '../validators/common.js';

const OPTION_HEADERS = ['optiona', 'optionb', 'optionc', 'optiond', 'optione', 'optionf'];

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');

const readRows = (buffer) => {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new AppError(422, 'IMPORT_VALIDATION_FAILED', 'The import file could not be read.');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError(422, 'IMPORT_VALIDATION_FAILED', 'The workbook has no sheets.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!rows.length) throw new AppError(422, 'IMPORT_VALIDATION_FAILED', 'The file is empty.');
  return rows;
};

const toInput = (headers, row) => {
  const record = {};
  headers.forEach((header, columnIndex) => {
    record[header] = row[columnIndex] ?? '';
  });
  const options = OPTION_HEADERS.map((header, index) => {
    const text = String(record[header] ?? '').trim();
    return text ? { id: String.fromCharCode(97 + index), text } : null;
  }).filter(Boolean);

  const numeric = String(record.numericanswer ?? '').trim();
  return {
    subject: String(record.subject ?? '').trim(),
    topic: String(record.topic ?? '').trim(),
    difficulty: String(record.difficulty ?? '').trim().toLowerCase(),
    type: String(record.type ?? '').trim().toLowerCase(),
    prompt: String(record.prompt ?? '').trim(),
    options,
    correctOptionIds: String(record.correctoptions ?? '')
      .split('|')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    numericAnswer: numeric === '' ? null : Number(numeric),
    explanation: String(record.explanation ?? '').trim(),
    defaultMarks: Number(record.defaultmarks),
    negativeMarks: String(record.negativemarks ?? '').trim() === '' ? 0 : Number(record.negativemarks),
  };
};

/**
 * Import CSV/XLSX rows. Bad rows are reported, good rows are still created
 * (partial success). Only an unreadable file or missing headers is a 422.
 */
export const importQuestions = async (questionRepo, user, buffer) => {
  const rows = readRows(buffer);
  const headers = rows[0].map(normalizeHeader);
  const missing = requiredImportHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new AppError(
      422,
      'IMPORT_VALIDATION_FAILED',
      'The file is missing required columns.',
      missing.map((header) => ({ path: header, message: `Missing column: ${header}` })),
    );
  }

  const errors = [];
  let createdCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = index + 1;
    if (!rows[index].some((cell) => String(cell ?? '').trim() !== '')) continue;
    const parsed = questionSchema.safeParse(toInput(headers, rows[index]));
    if (!parsed.success) {
      errors.push({
        row,
        code: 'VALIDATION_ERROR',
        message: 'This row could not be imported.',
        details: zodDetails(parsed.error),
      });
      continue;
    }
    await questionRepo.create({ ...parsed.data, createdBy: user.id });
    createdCount += 1;
  }

  return { createdCount, failedCount: errors.length, errors };
};
