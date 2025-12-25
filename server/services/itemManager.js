/**
 * Item Manager
 * 
 * Manages item data, classification, and update scheduling
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { deepCopy } from '../utils/common.js';
import {
  upsertItem,
  getItemById,
  getAllItems as dbGetAllItems,
  getItemsByClassification as dbGetItemsByClassification,
  getAllItemIds,
  getItemsNeedingUpdate as dbGetItemsNeedingUpdate,
  hasItem,
  getItemCount,
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Classification thresholds
const COLD_THRESHOLD = 100; // saleVelocity < 100
const MILD_THRESHOLD = 1000; // saleVelocity < 1000

// Update intervals in milliseconds
const HOT_UPDATE_INTERVAL = 60 * 1000; // 1 minute
const MILD_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour
const COLD_UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 1 day

// Item list from JSON file
const itemList = JSON.parse(
  readFileSync(join(__dirname, '../../src/assets/itemlist.json'), 'utf-8')
);

/**
 * Create a placeholder market data object with "NA" values
 * @returns {Object} Placeholder market data
 */
function createNAMarketData() {
  return {
    hasData: false,
    currentAveragePrice: 'NA',
    minPrice: 'NA',
    maxPrice: 'NA',
    listings: [],
    listingsCount: 0,
    unitsForSale: 'NA',
    unitsSold: 'NA',
  };
}

/**
 * Classify item based on sale velocity (using unitsSold)
 * @param {Object} marketData - Market data for the item
 * @returns {string} Classification: 'cold', 'mild', or 'hot'
 */
function classifyItem(marketData) {
  if (!marketData) {
    return 'cold'; // Default to cold if no data
  }

  // Check if we have actual data (not NA placeholder)
  // The API doesn't always include hasData field, so check for actual data fields
  const hasActualData = marketData.hasData === true || 
                       (marketData.unitsSold !== undefined && 
                        marketData.unitsSold !== null && 
                        marketData.unitsSold !== 'NA');

  if (!hasActualData) {
    return 'cold'; // Default to cold if no actual data
  }

  // Use unitsSold as velocity
  const unitsSold = marketData.unitsSold || 0;
  
  // Ensure unitsSold is a number for comparison
  const velocity = typeof unitsSold === 'number' ? unitsSold : parseFloat(unitsSold) || 0;

  if (velocity < COLD_THRESHOLD) {
    return 'cold';
  } else if (velocity < MILD_THRESHOLD) {
    return 'mild';
  } else {
    return 'hot';
  }
}

/**
 * Get update interval for item classification
 * @param {string} classification - Item classification
 * @returns {number} Update interval in milliseconds
 */
function getUpdateInterval(classification) {
  switch (classification) {
    case 'hot':
      return HOT_UPDATE_INTERVAL;
    case 'mild':
      return MILD_UPDATE_INTERVAL;
    case 'cold':
      return COLD_UPDATE_INTERVAL;
    default:
      return COLD_UPDATE_INTERVAL;
  }
}

/**
 * Process and store a single item's market data immediately
 * @param {number} itemID - Item ID
 * @param {Object} marketInfo - Market data from API
 * @param {Object} itemInfo - Item info from itemList
 * @returns {void}
 */
function processAndStoreItem(itemID, marketInfo, itemInfo) {
  // Ensure hasData is set correctly
  const hasActualData = (marketInfo.hasData === true) || 
                        (marketInfo.unitsSold !== undefined && 
                         marketInfo.unitsSold !== null &&
                         marketInfo.unitsSold !== 'NA' &&
                         typeof marketInfo.unitsSold === 'number');
  
  marketInfo.hasData = hasActualData;
  
  // Use unitsSold directly as velocity
  const classification = classifyItem(marketInfo);
  const updateInterval = getUpdateInterval(classification);
  const lastUpdate = Date.now();

  // Create a deep copy of marketInfo to avoid reference issues
  const marketDataCopy = deepCopy(marketInfo);
  marketDataCopy.hasData = marketInfo.hasData;
  
  const itemData = {
    id: itemID,
    name: itemInfo?.name || `Item ${itemID}`,
    number: itemInfo?.number || [],
    req: itemInfo?.req || [],
    marketData: marketDataCopy,
    classification,
    lastUpdate,
    nextUpdate: lastUpdate + updateInterval,
  };
  
  // Store immediately in database - this updates the state as soon as data is fetched
  upsertItem(itemData);
}

/**
 * Update item data from Universalis API
 * Updates items incrementally as batches are fetched (doesn't wait for all batches)
 * Uses unitsSold from market data as velocity
 * @param {number[]} itemIDs - Item IDs to update
 * @param {string} worldName - World/data center name
 * @param {number} entriesLimit - Limit for history entries (default: 20)
 * @returns {Promise<void>}
 */
async function updateItems(itemIDs, worldName = 'China', entriesLimit = 20) {
  if (itemIDs.length === 0) {
    return;
  }

  try {
    const { fetchMarketData, MAX_ITEMS_PER_CALL } = await import('./universalisClient.js');
    
    // Split into batches
    const batches = [];
    for (let i = 0; i < itemIDs.length; i += MAX_ITEMS_PER_CALL) {
      batches.push(itemIDs.slice(i, i + MAX_ITEMS_PER_CALL));
    }

    // Process batches sequentially and update items immediately as each batch completes
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const batchData = await fetchMarketData(batch, worldName, 5, entriesLimit);
        
        // Process items immediately from this batch
        const itemsToProcess = batchData.itemID !== undefined
          ? { [batchData.itemID]: batchData }
          : (batchData.items || {});
        
        // Update each item immediately as soon as batch data is received
        for (const itemID of batch) {
          const itemInfo = itemList.find(item => item.id === itemID);
          const marketInfo = itemsToProcess[itemID] || itemsToProcess[String(itemID)] || itemsToProcess[Number(itemID)];
          
          if (marketInfo) {
            processAndStoreItem(itemID, marketInfo, itemInfo);
          }
        }
      } catch (error) {
        console.error(`[Item Manager] Error processing batch ${i + 1}:`, error.message);
        // Continue with next batch even if this one fails
      }
    }
  } catch (error) {
    console.error(`[Item Manager] Error updating items:`, error.message);
    throw error;
  }
}

/**
 * Get items that need updating based on their classification
 * @returns {Object} Items grouped by classification that need updating
 */
function getItemsNeedingUpdate() {
  const now = Date.now();
  
  // Get items from database that need updating
  const dbItems = dbGetItemsNeedingUpdate(now);

  // Also include items that haven't been fetched yet
  const fetchedItemIDs = getAllItemIds();
  const unfetchedItems = itemList
    .map(item => item.id)
    .filter(id => !fetchedItemIDs.has(id));

  // Add unfetched items to cold items (will be classified after first fetch)
  return {
    hot: dbItems.hot,
    mild: dbItems.mild,
    cold: [...dbItems.cold, ...unfetchedItems],
  };
}


/**
 * Fetch all items in the background (first-time fetch)
 * Updates store immediately as data is fetched
 * @param {string} worldName - World/data center name
 * @returns {Promise<void>}
 */
async function initializeItems(worldName = 'China') {
  const allItemIDs = itemList.map(item => item.id);
  try {
    await updateItems(allItemIDs, worldName);
  } catch (error) {
    console.error(`[Item Manager] Background initialization error:`, error.message);
  }
}

/**
 * Get item data by ID
 * Returns item with NA values if not in database but exists in itemList
 * @param {number} itemID - Item ID
 * @returns {Object|null} Item data or null if not found
 */
function getItem(itemID) {
  const item = getItemById(itemID);
  if (item) {
    // Return a copy to avoid reference issues
    return deepCopy(item);
  }
  
  // If not in database, check if it exists in itemList and return with NA values
  const itemInfo = itemList.find(item => item.id === itemID);
  if (itemInfo) {
    return {
      id: itemID,
      name: itemInfo.name || `Item ${itemID}`,
      number: itemInfo.number || [],
      req: itemInfo.req || [],
      marketData: createNAMarketData(),
      classification: 'cold',
      lastUpdate: null,
      nextUpdate: Date.now(),
    };
  }
  
  return null;
}

/**
 * Get all items
 * Returns all items from itemList, with fetched data or NA values
 * @returns {Array} Array of all item data
 */
function getAllItems() {
  const dbItems = dbGetAllItems();
  const dbItemsMap = new Map(dbItems.map(item => [item.id, item]));
  const items = [];
  
  // Return all items from itemList, using database data or creating with NA values
  for (const itemInfo of itemList) {
    const itemID = itemInfo.id;
    const dbItem = dbItemsMap.get(itemID);
    
    if (dbItem) {
      items.push(dbItem);
    } else {
      items.push({
        id: itemID,
        name: itemInfo.name || `Item ${itemID}`,
        number: itemInfo.number || [],
        req: itemInfo.req || [],
        marketData: createNAMarketData(),
        classification: 'cold',
        lastUpdate: null,
        nextUpdate: Date.now(),
      });
    }
  }
  
  return items;
}

/**
 * Get items by classification
 * Returns items with fetched data or NA values that match the classification
 * @param {string} classification - 'hot', 'mild', or 'cold'
 * @returns {Array} Array of items with the specified classification
 */
function getItemsByClassification(classification) {
  const dbItems = dbGetItemsByClassification(classification);
  const dbItemsMap = new Map(dbItems.map(item => [item.id, item]));
  const items = [];
  
  // Get items from database with the classification
  items.push(...dbItems);
  
  // Also include items from itemList that haven't been fetched yet (default to 'cold')
  if (classification === 'cold') {
    const fetchedItemIDs = getAllItemIds();
    for (const itemInfo of itemList) {
      const itemID = itemInfo.id;
      if (!fetchedItemIDs.has(itemID)) {
        items.push({
          id: itemID,
          name: itemInfo.name || `Item ${itemID}`,
          number: itemInfo.number || [],
          req: itemInfo.req || [],
          marketData: createNAMarketData(),
          classification: 'cold',
          lastUpdate: null,
          nextUpdate: Date.now(),
        });
      }
    }
  }
  
  return items;
}

export {
  initializeItems,
  updateItems,
  getItemsNeedingUpdate,
  getItem,
  getAllItems,
  getItemsByClassification,
  classifyItem,
  getUpdateInterval,
  HOT_UPDATE_INTERVAL,
  MILD_UPDATE_INTERVAL,
  COLD_UPDATE_INTERVAL,
};
