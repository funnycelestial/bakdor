class ApiError extends Error {
  constructor(statusCode, message, meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.meta = meta;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;