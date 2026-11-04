const REQUIRED_HEADERS = [
  'subject',
  'topic',
  'difficulty',
  'type',
  'prompt',
  'correctoptions',
  'defaultmarks',
];

const OPTION_HEADERS = ['optiona', 'optionb', 'optionc', 'optiond', 'optione', 'optionf'];

export class ImportFileError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

export const parseCsvRows = (rawText) => {
  const raw = String(rawText ?? '');
  if (raw.includes('\u0000')) {
    throw new Error('Binary content is not valid CSV.');
  }

  const text = raw.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (cell.length > 0) {
        throw new Error('Unexpected quote inside unquoted CSV field.');
      }
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (inQuotes) {
    throw new Error('Unclosed quoted field in CSV.');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => String(value ?? '').trim() !== ''));
};

/**
 * RFC-4180 CSV reader aligned with server/src/utils/csv.js (no vulnerable xlsx dependency).
 */
export const parseImportFile = async (file) => {
  let rows;
  try {
    const text = typeof file.text === 'function' ? await file.text() : '';
    rows = parseCsvRows(text);
  } catch {
    throw new ImportFileError('IMPORT_VALIDATION_FAILED', 'The import file could not be read.');
  }

  if (!rows.length) {
    throw new ImportFileError('IMPORT_VALIDATION_FAILED', 'The file is empty.');
  }

  const headers = rows[0].map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new ImportFileError(
      'IMPORT_VALIDATION_FAILED',
      'The file is missing required columns.',
      missing.map((header) => ({ path: header, message: `Missing column: ${header}` })),
    );
  }

  return rows.slice(1).map((row, index) => {
    const record = {};
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] ?? '';
    });

    const options = OPTION_HEADERS.map((header, optionIndex) => {
      const text = String(record[header] ?? '').trim();
      if (!text) return null;
      return { id: String.fromCharCode(97 + optionIndex), text };
    }).filter(Boolean);

    return {
      row: index + 2,
      input: {
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
        numericAnswer:
          record.numericanswer === '' || record.numericanswer === undefined
            ? null
            : Number(record.numericanswer),
        explanation: String(record.explanation ?? '').trim(),
        defaultMarks: Number(record.defaultmarks),
        negativeMarks:
          record.negativemarks === '' || record.negativemarks === undefined
            ? 0
            : Number(record.negativemarks),
      },
    };
  });
};
