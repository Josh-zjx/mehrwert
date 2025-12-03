/**
 * Item Market Service
 * 
 * Loads item list from JSON and fetches market data using the Universalis API
 */

import { getItemMarketData } from './universalis.js';
import { logUserRequest } from './logger.js';
import itemListData from '../assets/itemlist.json';

// Constants for API limits
const MAX_ITEMS_PER_REQUEST = 20; // Maximum items per API call
const DEFAULT_LISTINGS_LIMIT = 5; // Limit listings per item to reduce network load
const DEFAULT_ENTRIES_LIMIT = 5; // Limit recent history entries per item
const DEFAULT_WORLD_NAME = 'China'; // Default data center/world name

/**
 * Loads the item list from the JSON file
 * @returns {Array} Array of item objects with id, name, number, and req properties
 */
export function loadItemList() {
  return itemListData;
}

/**
 * Fetches market data for all items in the item list with batching and limits
 * @param {string|null} worldName - Optional world/data center name (default: "China")
 * @param {number|null} listingsLimit - Optional limit for listings per item (default: 5)
 * @param {number|null} entriesLimit - Optional limit for recent history entries per item (default: 5)
 * @param {Function|null} progressCallback - Optional callback function(progress) called with progress 0-100
 * @returns {Promise<Object>} Object mapping item IDs to market data
 */
export async function fetchAllItemMarketData(worldName = DEFAULT_WORLD_NAME, listingsLimit = DEFAULT_LISTINGS_LIMIT, entriesLimit = DEFAULT_ENTRIES_LIMIT, progressCallback = null) {
  const itemList = loadItemList();
  const itemIDs = itemList.map(item => item.id);
  
  // Use default world name if not provided (API requires a world/data center name)
  const effectiveWorldName = worldName || DEFAULT_WORLD_NAME;
  
  // getItemMarketData handles batching internally and supports progress callbacks
  // The function will automatically batch requests if > 100 items
  
  const marketData = await getItemMarketData(itemIDs, effectiveWorldName, listingsLimit, entriesLimit, progressCallback);
  
  // If single item response, wrap it
  if (marketData.itemID !== undefined) {
    return {
      [marketData.itemID]: marketData
    };
  }
  
  // Return items object from multiple items response
  return marketData.items || {};
}

/**
 * Fetches market data for a specific item by ID
 * @param {number} itemID - The item ID to fetch
 * @param {string|null} worldName - Optional world/data center name (default: "China")
 * @param {number|null} listingsLimit - Optional limit for listings per item
 * @param {number|null} entriesLimit - Optional limit for recent history entries per item
 * @returns {Promise<Object>} Market data for the item
 */
export async function fetchItemMarketData(itemID, worldName = DEFAULT_WORLD_NAME, listingsLimit = DEFAULT_LISTINGS_LIMIT, entriesLimit = DEFAULT_ENTRIES_LIMIT) {
  const effectiveWorldName = worldName || DEFAULT_WORLD_NAME;
  return await getItemMarketData([itemID], effectiveWorldName, listingsLimit, entriesLimit);
}

/**
 * Combines item list data with market data
 * @param {string|null} worldName - Optional world/data center name (default: "China")
 * @param {number|null} listingsLimit - Optional limit for listings per item (default: 5)
 * @param {number|null} entriesLimit - Optional limit for recent history entries per item (default: 5)
 * @param {Function|null} progressCallback - Optional callback function(progress) called with progress 0-100
 * @returns {Promise<Array>} Array of items with market data attached
 */
export async function getItemsWithMarketData(worldName = DEFAULT_WORLD_NAME, listingsLimit = DEFAULT_LISTINGS_LIMIT, entriesLimit = DEFAULT_ENTRIES_LIMIT, progressCallback = null) {
  const itemList = loadItemList();
  const effectiveWorldName = worldName || DEFAULT_WORLD_NAME;
  
  // Log user request
  logUserRequest({
    worldName: effectiveWorldName,
    listingsLimit,
    entriesLimit,
    itemCount: itemList.length,
  });
  
  const marketData = await fetchAllItemMarketData(effectiveWorldName, listingsLimit, entriesLimit, progressCallback);
  
  return itemList.map(item => {
    const marketInfo = marketData[item.id] || null;
    return {
      ...item,
      marketData: marketInfo
    };
  });
}
