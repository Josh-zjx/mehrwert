/**
 * Item Manager
 * 
 * Manages item data, classification, and update scheduling
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchMarketDataBatched } from './universalisClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Classification thresholds
const COLD_THRESHOLD = 100; // saleVelocity < 100
const MILD_THRESHOLD = 500; // saleVelocity < 500

// Update intervals in milliseconds
const HOT_UPDATE_INTERVAL = 60 * 1000; // 1 minute
const MILD_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour
const COLD_UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 1 day

// In-memory storage for item data
const itemDataStore = new Map();
const itemList = JSON.parse(
  readFileSync(join(__dirname, '../../src/assets/itemlist.json'), 'utf-8')
);

/**
 * Classify item based on sale velocity
 * @param {Object} marketData - Market data for the item
 * @returns {string} Classification: 'cold', 'mild', or 'hot'
 */
function classifyItem(marketData) {
  if (!marketData || !marketData.hasData) {
    return 'cold'; // Default to cold if no data
  }

  const saleVelocity = marketData.regularSaleVelocity || 0;

  if (saleVelocity < COLD_THRESHOLD) {
    return 'cold';
  } else if (saleVelocity < MILD_THRESHOLD) {
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
 * Update item data from Universalis API
 * @param {number[]} itemIDs - Item IDs to update
 * @param {string} worldName - World/data center name
 * @returns {Promise<void>}
 */
async function updateItems(itemIDs, worldName = 'China') {
  if (itemIDs.length === 0) {
    return;
  }

  console.log(`[Item Manager] Updating ${itemIDs.length} items...`);

  try {
    const marketData = await fetchMarketDataBatched(itemIDs, worldName);

    // Process each item
    for (const itemID of itemIDs) {
      const itemInfo = itemList.find(item => item.id === itemID);
      const marketInfo = marketData.items[itemID] || marketData.items[String(itemID)];

      if (marketInfo) {
        const classification = classifyItem(marketInfo);
        const updateInterval = getUpdateInterval(classification);
        const lastUpdate = Date.now();

        itemDataStore.set(itemID, {
          id: itemID,
          name: itemInfo?.name || `Item ${itemID}`,
          number: itemInfo?.number || [],
          req: itemInfo?.req || [],
          marketData: marketInfo,
          classification,
          lastUpdate,
          nextUpdate: lastUpdate + updateInterval,
        });

        console.log(`[Item Manager] Updated item ${itemID} (${itemInfo?.name || 'Unknown'}) - Classification: ${classification}`);
      } else {
        console.warn(`[Item Manager] No market data for item ${itemID}`);
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
  const hotItems = [];
  const mildItems = [];
  const coldItems = [];

  for (const [itemID, itemData] of itemDataStore.entries()) {
    if (now >= itemData.nextUpdate) {
      switch (itemData.classification) {
        case 'hot':
          hotItems.push(itemID);
          break;
        case 'mild':
          mildItems.push(itemID);
          break;
        case 'cold':
          coldItems.push(itemID);
          break;
      }
    }
  }

  // Also include items that haven't been fetched yet
  const fetchedItemIDs = new Set(itemDataStore.keys());
  const unfetchedItems = itemList
    .map(item => item.id)
    .filter(id => !fetchedItemIDs.has(id));

  // Add unfetched items to cold items (will be classified after first fetch)
  coldItems.push(...unfetchedItems);

  return {
    hot: hotItems,
    mild: mildItems,
    cold: coldItems,
  };
}

/**
 * Initialize all items (first-time fetch)
 * @param {string} worldName - World/data center name
 * @returns {Promise<void>}
 */
async function initializeItems(worldName = 'China') {
  console.log(`[Item Manager] Initializing ${itemList.length} items...`);
  const allItemIDs = itemList.map(item => item.id);
  await updateItems(allItemIDs, worldName);
  console.log(`[Item Manager] Initialization complete`);
}

/**
 * Get item data by ID
 * @param {number} itemID - Item ID
 * @returns {Object|null} Item data or null if not found
 */
function getItem(itemID) {
  return itemDataStore.get(itemID) || null;
}

/**
 * Get all items
 * @returns {Array} Array of all item data
 */
function getAllItems() {
  return Array.from(itemDataStore.values());
}

/**
 * Get items by classification
 * @param {string} classification - 'hot', 'mild', or 'cold'
 * @returns {Array} Array of items with the specified classification
 */
function getItemsByClassification(classification) {
  return Array.from(itemDataStore.values()).filter(
    item => item.classification === classification
  );
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
