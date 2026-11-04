/**
 * CSV cell escaping and RFC-4180 compliant CSV parsing.
 * Text cells are always quoted; numbers/booleans follow the contract example.
 * Cells beginning with a formula sigil are prefixed with an apostrophe so
 * spreadsheets never execute them.
 */
export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return `"${value}"`;
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export const toCsvRow = (values) => values.map(escapeCsvCell).join(',');

export const slugify = (value) =>
  String(value || 'exam')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'exam';

/**
 * Parse a UTF-8 CSV buffer or string into a 2D array of string cells.
 * Throws Error on binary content or malformed/unclosed quotes.
 */
export const parseCsvRows = (input) => {
  const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input ?? '');
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
