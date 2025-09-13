const { validationResult } = require('express-validator');

/**
 * Middleware to validate express-validator results
 * If there are validation errors, returns a 400 response with error details
 * If no errors, proceeds to the next middleware
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((error) => ({
        field: error.param,
        message: error.msg,
        value: error.value,
      })),
    });
  }

  next();
};

/**
 * Alternative version that formats errors using your existing formatValidationErrors
 * Use this if you want consistent error formatting across your app
 */
const validateRequestWithFormatting = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const { formatValidationErrors } = require('./errorHandler');
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: formatValidationErrors(errors),
    });
  }

  next();
};

module.exports = {
  validateRequest,
  validateRequestWithFormatting,
};
