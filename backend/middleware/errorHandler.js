/**
 * Centralized Error & Exception Handling Middleware (MVC)
 */
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  res.status(statusCode).json({
    error: err.message || "An unexpected server error occurred.",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
}

module.exports = { errorHandler };
