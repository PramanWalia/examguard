/**
 * Domain + HTTP error used by every layer.
 *
 * Services throw AppError; the central error handler renders the contract
 * envelope. Repositories throw repository errors (see repositories/errors.js)
 * so they stay transport-agnostic.
 */
export class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Array<{path: string, message: string}>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

export const badRequest = (message = 'One or more fields are invalid.', details) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (code, message) => new AppError(409, code, message);
