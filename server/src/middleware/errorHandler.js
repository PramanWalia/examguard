import { AppError } from '../utils/errors.js';

const envelope = (res, status, code, message, details) =>
  res.status(status).json({
    success: false,
    error: { code, message, ...(details?.length ? { details } : {}) },
  });

/**
 * Single error renderer. Contract: { success: false, error: { code, message, details } }.
 * Unexpected failures never leak internals.
 */
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return envelope(res, err.status, err.code, err.message, err.details);
  }
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return envelope(res, 413, 'FILE_TOO_LARGE', 'The import file is too large.');
    }
    return envelope(res, 400, 'VALIDATION_ERROR', 'The upload could not be read.');
  }
  if (err?.type === 'entity.parse.failed') {
    return envelope(res, 400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return envelope(res, 413, 'VALIDATION_ERROR', 'The request body is too large.');
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }
  return envelope(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
};
