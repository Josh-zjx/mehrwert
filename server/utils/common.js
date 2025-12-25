/**
 * Common Utility Functions
 * 
 * Shared utilities used across the application
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
 * Create a deep copy of an object using JSON serialization
 * @param {*} obj - Object to copy
 * @returns {*} Deep copy of the object
 */
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
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
      queryParams.push(`${key}=${value}`);
    }
  }
  
  return queryParams.length > 0 ? '?' + queryParams.join('&') : '';
}

/**
 * Parse a database row with JSON fields
 * @param {Object} row - Database row object
 * @param {string[]} jsonFields - Array of field names that contain JSON
 * @returns {Object} Parsed row object
 */
export function parseDbRow(row, jsonFields = []) {
  if (!row) return null;
  
  const parsed = { ...row };
  
  for (const field of jsonFields) {
    if (row[field] !== undefined) {
      try {
        parsed[field] = JSON.parse(row[field] || (Array.isArray(parsed[field]) ? '[]' : '{}'));
      } catch (error) {
        console.error(`Error parsing JSON field ${field}:`, error);
        parsed[field] = Array.isArray(parsed[field]) ? [] : {};
      }
    }
  }
  
  return parsed;
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

