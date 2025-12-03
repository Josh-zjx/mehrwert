/**
 * Backend API Service
 * 
 * Client for communicating with the backend server
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Fetch all items from backend
 * @param {string} classification - Optional classification filter ('hot', 'mild', 'cold')
 * @returns {Promise<Array>} Array of items
 */
export async function fetchAllItems(classification = null) {
  try {
    const url = classification 
      ? `${API_BASE_URL}/api/items?classification=${classification}`
      : `${API_BASE_URL}/api/items`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching items from backend:', error);
    throw error;
  }
}

/**
 * Fetch item by ID from backend
 * @param {number} itemID - Item ID
 * @returns {Promise<Object>} Item data
 */
export async function fetchItemById(itemID) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items/${itemID}`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.item;
  } catch (error) {
    console.error('Error fetching item from backend:', error);
    throw error;
  }
}

/**
 * Fetch multiple items by IDs from backend
 * @param {number[]} itemIDs - Array of item IDs
 * @returns {Promise<Array>} Array of items
 */
export async function fetchItemsByIds(itemIDs) {
  try {
    const idsString = itemIDs.join(',');
    const response = await fetch(`${API_BASE_URL}/api/items/batch/${idsString}`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching items from backend:', error);
    throw error;
  }
}

/**
 * Fetch server statistics
 * @returns {Promise<Object>} Server statistics
 */
export async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching stats from backend:', error);
    throw error;
  }
}

/**
 * Check backend health
 * @returns {Promise<Object>} Health status
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error checking backend health:', error);
    throw error;
  }
}
