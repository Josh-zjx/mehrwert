/**
 * Backend API Service
 * 
 * Client for communicating with the backend server
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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
 * Fetch all items from backend
 * @param {string} classification - Optional classification filter ('hot', 'mild', 'cold')
 * @returns {Promise<Array>} Array of items
 */
export async function fetchAllItems(classification = null) {
  const url = classification 
    ? `${API_BASE_URL}/api/items?classification=${classification}`
    : `${API_BASE_URL}/api/items`;
  
  const data = await apiRequest(url, 'fetching items from backend');
  return data.items || [];
}

/**
 * Fetch item by ID from backend
 * @param {number} itemID - Item ID
 * @returns {Promise<Object>} Item data
 */
export async function fetchItemById(itemID) {
  const data = await apiRequest(
    `${API_BASE_URL}/api/items/${itemID}`, 
    'fetching item from backend'
  );
  return data.item;
}

/**
 * Fetch multiple items by IDs from backend
 * @param {number[]} itemIDs - Array of item IDs
 * @returns {Promise<Array>} Array of items
 */
export async function fetchItemsByIds(itemIDs) {
  const idsString = itemIDs.join(',');
  const data = await apiRequest(
    `${API_BASE_URL}/api/items/batch/${idsString}`, 
    'fetching items from backend'
  );
  return data.items || [];
}

/**
 * Fetch server statistics
 * @returns {Promise<Object>} Server statistics
 */
export async function fetchStats() {
  return await apiRequest(`${API_BASE_URL}/api/stats`, 'fetching stats from backend');
}

/**
 * Check backend health
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  return await apiRequest(`${API_BASE_URL}/health`, 'checking backend health');
}
