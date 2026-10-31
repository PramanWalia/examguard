import { randomBytes } from 'node:crypto';

/** Mongo-shaped 24-character lowercase hex id (the contract's id format). */
export const newId = () => randomBytes(12).toString('hex');

export const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export const isObjectId = (value) => OBJECT_ID_PATTERN.test(String(value || ''));

/** ISO timestamp used everywhere in the API. */
export const nowIso = () => new Date().toISOString();

export const toIso = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** `null`/undefined-safe ISO date comparison. */
export const ms = (value) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};
