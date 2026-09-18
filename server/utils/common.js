/**
 * Common Utility Functions
 *
 * Shared utilities used across the server
 */

/**
 * Delay function to wait for a specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build query string from parameters object
 * @param {Object} params - Key-value pairs for query parameters
 * @returns {string} Query string (empty if no params)
 */
export function buildQueryString(params) {
  const queryParams = [];

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }

  return queryParams.length > 0 ? '?' + queryParams.join('&') : '';
}

/**
 * Handle API errors consistently in Express routes
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code (default: 500)
 */
export function handleApiError(res, error, statusCode = 500) {
  res.status(statusCode).json({
    success: false,
    error: error.message,
  });
}
