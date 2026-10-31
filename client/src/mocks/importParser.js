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

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');

/**
 * The mock uses the same `xlsx` reader the backend will use. It accepts CSV and
 * XLSX so the import dialog can be exercised without a server.
 */
export const parseImportFile = async (file) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ImportFileError('IMPORT_VALIDATION_FAILED', 'The workbook has no sheets.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!rows.length) throw new ImportFileError('IMPORT_VALIDATION_FAILED', 'The file is empty.');

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
        negativeMarks: record.negativemarks === '' || record.negativemarks === undefined
          ? 0
          : Number(record.negativemarks),
      },
    };
  });
};
