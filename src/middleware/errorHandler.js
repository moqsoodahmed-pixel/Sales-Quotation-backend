const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} — ${req.method} ${req.originalUrl}${err.stack ? `\n${err.stack}` : ''}`);

  let statusCode = err.statusCode || 500;
  // err.message is coerced through String() and falls back to a fixed
  // string for any falsy value (undefined, null, "") - this guarantees the
  // client never receives a body of literal `null` (e.g. from `throw null`
  // or `throw new Error()`), which previously broke the frontend's
  // JSON.parse of the error blob (QuotationDetailPage.jsx).
  let message = (err && err.message) ? String(err.message) : 'Internal Server Error';
  let recognized = Boolean(err.statusCode);

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    statusCode = 409;
    recognized = true;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(e => e.message).join(', ');
    statusCode = 422;
    recognized = true;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') { message = 'Invalid token.'; statusCode = 401; recognized = true; }
  if (err.name === 'TokenExpiredError') { message = 'Token expired.'; statusCode = 401; recognized = true; }
  if (err.name === 'CastError') { message = `Invalid ${err.path}: ${err.value}`; statusCode = 400; recognized = true; }

  // Multer upload errors (file too large, unsupported type from fileFilter, etc.)
  if (err.name === 'MulterError' || err.message?.startsWith('Unsupported file type')) { statusCode = 400; recognized = true; }

  // Anything not explicitly recognized above is an unexpected/internal error
  // (e.g. a DB driver exception, a bug) whose message may contain stack
  // details, file paths, or other internals - never expose those to the
  // client outside development. Recognized errors above already have
  // deliberately client-safe messages, so they pass through unchanged.
  if (!recognized && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = errorHandler;
