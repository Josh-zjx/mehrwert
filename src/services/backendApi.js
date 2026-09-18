/**
 * Backend API Service
 *
 * Client for the backend's classification index. Market data is NOT fetched
 * through here - it comes straight from Universalis via itemMarketService.js.
 *
 * Requests are relative by default (`/api/...`), which works both when the Express
 * server serves the built frontend itself and in development via Vite's proxy
 * (see vite.config.js). Set VITE_API_BASE_URL at build time only when the frontend
 * is hosted separately from the API.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Helper function to make API requests with consistent error handling
 * @param {string} url - URL to fetch
 * @param {string} errorContext - Context for error message
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(url, errorContext) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error ${errorContext}:`, error);
    throw error;
  }
}

/**
 * Fetch every data center Universalis supports, with indexing coverage
 * @returns {Promise<Object>} { defaultDataCenter, dataCenters: [{ name, region,
 *   worldCount, indexed, active, updatedAt }] }
 */
export async function fetchDataCenters() {
  return await apiRequest(`${API_BASE_URL}/api/data-centers`, 'fetching data centers');
}

/**
 * Fetch the classification index for a data center
 * @param {string} dataCenter - Data center name
 * @returns {Promise<Object>} Index payload: { dataCenter, updatedAt, sweeping,
 *   total, indexed, hotLimit, mildThreshold, velocities: { [itemID]: unitsPerDay } }
 */
export async function fetchIndex(dataCenter) {
  const query = dataCenter ? `?dc=${encodeURIComponent(dataCenter)}` : '';
  return await apiRequest(`${API_BASE_URL}/api/index${query}`, 'fetching index from backend');
}

/**
 * Check backend health
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  return await apiRequest(`${API_BASE_URL}/health`, 'checking backend health');
}
