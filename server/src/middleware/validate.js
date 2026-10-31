import { badRequest } from '../utils/errors.js';
import { zodDetails } from '../validators/common.js';

/**
 * Validate and replace a request source (body|query|params). Unknown keys are
 * rejected because every schema is `.strict()`.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(badRequest('One or more fields are invalid.', zodDetails(result.error)));
  }
  if (source === 'query') {
    req.query = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};
