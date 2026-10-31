import { notFound } from '../utils/errors.js';

export const notFoundHandler = (req, _res, next) => {
  next(notFound(`No route matches ${req.method} ${req.originalUrl}.`));
};
