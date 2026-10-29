const { ZodError } = require('zod');
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details;
  if (error instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request';
    details = error.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
  } else if (error instanceof ApiError) {
    ({ status, code, message } = error);
  } else if (error.code === 11000) {
    status = 409; code = 'DUPLICATE_REFERENCE'; message = 'Reference already exists for this account';
  } else if (error.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON';
  } else if (error.type === 'entity.too.large') {
    status = 400; code = 'BODY_TOO_LARGE'; message = 'Request body is too large';
  }
  if (status === 500) console.error(error);
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
module.exports = { ApiError, errorHandler };
