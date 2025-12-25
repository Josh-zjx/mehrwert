/**
 * Common Utility Functions
 * 
 * Shared utilities used across the frontend application
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
      queryParams.push(`${key}=${value}`);
    }
  }
  
  return queryParams.length > 0 ? '?' + queryParams.join('&') : '';
}
