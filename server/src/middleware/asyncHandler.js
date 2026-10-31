/**
 * asyncHandler - Wraps async route handlers to pass errors to Express error middleware.
 * Usage: router.get('/...', asyncHandler(async (req, res, next) => { ... }))
 *
 * Why: Controllers stay clean — no try/catch boilerplate. If the wrapped function
 * throws (synchronously or asynchronously), Express error middleware handles it.
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};