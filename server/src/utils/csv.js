/**
 * CSV cell escaping. Text cells are always quoted; numbers/booleans follow the
 * contract example. Cells beginning with a formula sigil are prefixed with an
 * apostrophe so spreadsheets never execute them.
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
