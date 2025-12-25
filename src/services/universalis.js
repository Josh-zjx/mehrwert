/**
 * Universalis API Service
 * 
 * Fetches and parses item price and sales information from the Universalis API.
 * Documentation: https://docs.universalis.app/
 * 
 * API Endpoints:
 * - Single item: /api/v2/{worldName}/{itemID} or /api/v2/{itemID}
 * - Multiple items: /api/v2/{worldName}/{itemID1},{itemID2},... or /api/v2/{itemID1},{itemID2},...
 */

import { logApiCallStart, logApiCallSuccess, logApiCallError, logDelay, logBatchProgress } from './logger.js';
import { delay, buildQueryString } from '../utils/common.js';

// API base URL - Universalis API already supports CORS (access-control-allow-origin: *)
// In development, can use proxy (/api/v2) or direct API (https://universalis.app/api/v2)
// In production, use direct API
const UNIVERSALIS_API_BASE = import.meta.env.DEV 
  ? '/api/v2'  // Use proxy in development (optional - API already supports CORS)
  : 'https://universalis.app/api/v2';  // Direct API call in production

/**
 * Fetches market data for one or more items
 * 
 * @param {number[]} itemIDs - Array of item IDs to fetch (max 100 items)
 * @param {string|null} worldName - Optional world name (e.g., "Materia", "Chaos"). If null, fetches from all worlds
 * @param {number|null} listingsLimit - Optional limit for number of listings to return per item
 * @param {number|null} entriesLimit - Optional limit for number of recent history entries to return per item
 * @returns {Promise<Object>} Market data response from Universalis API
 */
async function fetchMarketData(itemIDs, worldName = null, listingsLimit = null, entriesLimit = null, batchInfo = null) {
  if (!itemIDs || itemIDs.length === 0) {
    throw new Error('itemIDs array cannot be empty');
  }

  if (itemIDs.length > 20) {
    throw new Error('Cannot fetch more than 20 items in a single API call');
  }

  // Validate itemIDs are numbers
  const validItemIDs = itemIDs.filter(id => typeof id === 'number' && !isNaN(id));
  if (validItemIDs.length === 0) {
    throw new Error('No valid item IDs provided');
  }

  // Build URL
  const itemIDsString = validItemIDs.join(',');
  let url = worldName 
    ? `${UNIVERSALIS_API_BASE}/${worldName}/${itemIDsString}`
    : `${UNIVERSALIS_API_BASE}/${itemIDsString}`;

  // Add query parameters for limiting results
  const params = {};
  if (listingsLimit !== null && listingsLimit !== undefined) {
    params.listings = listingsLimit;
  }
  if (entriesLimit !== null && entriesLimit !== undefined) {
    params.entries = entriesLimit;
  }
  
  url += buildQueryString(params);

  const startTime = Date.now();
  
  try {
      logApiCallStart({
        url,
        itemIDs: validItemIDs,
        worldName,
        listingsLimit,
        entriesLimit,
        batchNumber: batchInfo?.batchNumber,
        totalBatches: batchInfo?.totalBatches,
      });

    const response = await fetch(url);
    
    if (!response.ok) {
      const error = new Error(`Universalis API error: ${response.status} ${response.statusText}`);
      logApiCallError({
        url,
        itemIDs: validItemIDs,
        error: error.message,
      });
      throw error;
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;
    
    logApiCallSuccess({
      url,
      itemIDs: validItemIDs,
      responseTime: `${responseTime}ms`,
      batchNumber: batchInfo?.batchNumber,
      totalBatches: batchInfo?.totalBatches,
    });
    
    return data;
  } catch (error) {
    const responseTime = Date.now() - startTime;
      logApiCallError({
        url,
        itemIDs: validItemIDs,
        error: error.message,
        responseTime: `${responseTime}ms`,
        batchNumber: batchInfo?.batchNumber,
        totalBatches: batchInfo?.totalBatches,
      });
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to Universalis API');
    }
    throw error;
  }
}

/**
 * Parses market data for a single item
 * 
 * @param {Object} itemData - Raw item data from Universalis API
 * @returns {Object} Parsed item data with structured information
 */
function parseItemData(itemData) {
  if (!itemData || !itemData.hasData) {
    return {
      itemID: itemData?.itemID || null,
      hasData: false,
      error: 'No market data available for this item',
      listings: [],
      listingsCount: 0,
      unitsForSale: 0,
      recentHistory: [],
      recentHistoryCount: 0,
      unitsSold: 0,
      prices: {
        currentAverage: 0,
        currentAverageNQ: 0,
        currentAverageHQ: 0,
        average: 0,
        averageNQ: 0,
        averageHQ: 0,
        min: 0,
        minNQ: 0,
        minHQ: 0,
        max: 0,
        maxNQ: 0,
        maxHQ: 0,
      },
      saleVelocity: {
        regular: 0,
        nq: 0,
        hq: 0,
      },
      stackSizeHistogram: {},
      stackSizeHistogramNQ: {},
      stackSizeHistogramHQ: {},
      lastUploadTime: null,
      dcName: null,
      worldUploadTimes: {},
    };
  }

  return {
    itemID: itemData.itemID,
    hasData: true,
    // Current listings
    listings: itemData.listings || [],
    listingsCount: itemData.listingsCount || 0,
    unitsForSale: itemData.unitsForSale || 0,
    
    // Recent sales history
    recentHistory: itemData.recentHistory || [],
    recentHistoryCount: itemData.recentHistoryCount || 0,
    unitsSold: itemData.unitsSold || 0,
    
    // Price statistics
    prices: {
      currentAverage: itemData.currentAveragePrice || 0,
      currentAverageNQ: itemData.currentAveragePriceNQ || 0,
      currentAverageHQ: itemData.currentAveragePriceHQ || 0,
      average: itemData.averagePrice || 0,
      averageNQ: itemData.averagePriceNQ || 0,
      averageHQ: itemData.averagePriceHQ || 0,
      min: itemData.minPrice || 0,
      minNQ: itemData.minPriceNQ || 0,
      minHQ: itemData.minPriceHQ || 0,
      max: itemData.maxPrice || 0,
      maxNQ: itemData.maxPriceNQ || 0,
      maxHQ: itemData.maxPriceHQ || 0,
    },
    
    // Sale velocity (items sold per day)
    saleVelocity: {
      regular: itemData.regularSaleVelocity || 0,
      nq: itemData.nqSaleVelocity || 0,
      hq: itemData.hqSaleVelocity || 0,
    },
    
    // Stack size distribution
    stackSizeHistogram: itemData.stackSizeHistogram || {},
    stackSizeHistogramNQ: itemData.stackSizeHistogramNQ || {},
    stackSizeHistogramHQ: itemData.stackSizeHistogramHQ || {},
    
    // Metadata
    lastUploadTime: itemData.lastUploadTime || null,
    dcName: itemData.dcName || null,
    worldUploadTimes: itemData.worldUploadTimes || {},
  };
}

/**
 * Fetches and parses market data for one or more items
 * 
 * @param {number[]} itemIDs - Array of item IDs to fetch (will be batched if > 20)
 * @param {string|null} worldName - Optional world name (e.g., "Materia", "Chaos"). If null, fetches from all worlds
 * @param {number|null} listingsLimit - Optional limit for number of listings to return per item
 * @param {number|null} entriesLimit - Optional limit for number of recent history entries to return per item
 * @param {Function|null} progressCallback - Optional callback function(progress) called with progress 0-100
 * @returns {Promise<Object>} Parsed market data
 * @returns {Promise<Object[]>} If single item, returns parsed item data object
 * @returns {Promise<Object>} If multiple items, returns object with itemIDs array and items object keyed by itemID
 */
async function getItemMarketData(itemIDs, worldName = null, listingsLimit = null, entriesLimit = null, progressCallback = null) {
  const MAX_ITEMS_PER_BATCH = 20; // Maximum items per API call
  const DELAY_BETWEEN_CALLS_MS = 1000; // 200ms delay between API calls
  
  // Batch requests if more than MAX_ITEMS_PER_BATCH items
  if (itemIDs.length > MAX_ITEMS_PER_BATCH) {
    const batches = [];
    for (let i = 0; i < itemIDs.length; i += MAX_ITEMS_PER_BATCH) {
      batches.push(itemIDs.slice(i, i + MAX_ITEMS_PER_BATCH));
    }
    
    const totalBatches = batches.length;
    const batchResults = [];
    
    // Process batches sequentially with delay between calls
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Add delay before each API call (except the first one)
      if (i > 0) {
        logDelay(DELAY_BETWEEN_CALLS_MS);
        await delay(DELAY_BETWEEN_CALLS_MS);
      }
      
      const batchData = await fetchMarketData(batch, worldName, listingsLimit, entriesLimit, {
        batchNumber: i + 1,
        totalBatches: totalBatches,
      });
      batchResults.push(batchData);
      
      // Update progress
      if (progressCallback) {
        const progress = Math.round(((i + 1) / totalBatches) * 100);
        progressCallback(progress);
        logBatchProgress({
          currentBatch: i + 1,
          totalBatches: totalBatches,
          progress: progress,
        });
      }
    }
    
    // Combine all batch results
    const allItems = {};
    const allItemIDs = [];
    
    for (const batchData of batchResults) {
      if (batchData.itemID !== undefined) {
        // Single item response
        const parsed = parseItemData(batchData);
        allItems[batchData.itemID] = parsed;
        allItemIDs.push(batchData.itemID);
      } else if (batchData.items && typeof batchData.items === 'object') {
        // Multiple items response
        if (batchData.itemIDs) {
          allItemIDs.push(...batchData.itemIDs);
        }
        for (const [itemID, itemData] of Object.entries(batchData.items)) {
          allItems[itemID] = parseItemData(itemData);
        }
      }
    }
    
    return {
      itemIDs: allItemIDs,
      items: allItems,
    };
  }
  
  // Single batch request
  if (progressCallback) {
    progressCallback(50);
  }
  
  const data = await fetchMarketData(itemIDs, worldName, listingsLimit, entriesLimit);
  
  if (progressCallback) {
    progressCallback(100);
  }
  
  // Handle single item response
  if (data.itemID !== undefined) {
    return parseItemData(data);
  }
  
  // Handle multiple items response
  if (data.items && typeof data.items === 'object') {
    const parsedItems = {};
    
    for (const [itemID, itemData] of Object.entries(data.items)) {
      parsedItems[itemID] = parseItemData(itemData);
    }
    
    return {
      itemIDs: data.itemIDs || [],
      items: parsedItems,
    };
  }
  
  throw new Error('Unexpected response format from Universalis API');
}

/**
 * Gets the cheapest listing for an item
 * 
 * @param {Object} parsedItemData - Parsed item data from getItemMarketData
 * @returns {Object|null} Cheapest listing or null if no listings
 */
function getCheapestListing(parsedItemData) {
  if (!parsedItemData.hasData || !parsedItemData.listings || parsedItemData.listings.length === 0) {
    return null;
  }
  
  return parsedItemData.listings.reduce((cheapest, listing) => {
    if (!cheapest || listing.pricePerUnit < cheapest.pricePerUnit) {
      return listing;
    }
    return cheapest;
  }, null);
}

/**
 * Gets the most recent sale for an item
 * 
 * @param {Object} parsedItemData - Parsed item data from getItemMarketData
 * @returns {Object|null} Most recent sale or null if no sales history
 */
function getMostRecentSale(parsedItemData) {
  if (!parsedItemData.hasData || !parsedItemData.recentHistory || parsedItemData.recentHistory.length === 0) {
    return null;
  }
  
  return parsedItemData.recentHistory.reduce((mostRecent, sale) => {
    if (!mostRecent || sale.timestamp > mostRecent.timestamp) {
      return sale;
    }
    return mostRecent;
  }, null);
}

/**
 * Calculates total value of all listings for an item
 * 
 * @param {Object} parsedItemData - Parsed item data from getItemMarketData
 * @returns {number} Total value of all listings
 */
function getTotalListingsValue(parsedItemData) {
  if (!parsedItemData.hasData || !parsedItemData.listings) {
    return 0;
  }
  
  return parsedItemData.listings.reduce((total, listing) => {
    return total + listing.total;
  }, 0);
}

export {
  fetchMarketData,
  parseItemData,
  getItemMarketData,
  getCheapestListing,
  getMostRecentSale,
  getTotalListingsValue,
};
