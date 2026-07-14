class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function createError(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
  return new AppError(message, statusCode, code, details);
}

function sendError(res, error, fallbackMessage = "Server Error") {
  const statusCode = Number(error?.statusCode) || 500;
  const message =
    statusCode >= 500
      ? fallbackMessage
      : error?.message || fallbackMessage;

  const payload = {
    success: false,
    message,
    error: {
      code: error?.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
    },
  };

  if (error?.details && statusCode < 500) {
    payload.error.details = error.details;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  AppError,
  createError,
  sendError,
};
