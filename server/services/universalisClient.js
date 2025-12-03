/**
 * Universalis API Client
 * 
 * Handles API calls to Universalis with rate limiting
 */

const UNIVERSALIS_API_BASE = 'https://universalis.app/api/v2';
const MAX_ITEMS_PER_CALL = 10;
const DELAY_BETWEEN_CALLS_MS = 1000; // 1 second

/**
 * Delay function
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch market data for items from Universalis API
 * @param {number[]} itemIDs - Array of item IDs (max 10)
 * @param {string} worldName - World/data center name (default: 'China')
 * @param {number} listingsLimit - Limit for listings per item
 * @param {number} entriesLimit - Limit for recent history entries per item
 * @returns {Promise<Object>} Market data response
 */
async function fetchMarketData(itemIDs, worldName = 'China', listingsLimit = 5, entriesLimit = 5) {
  if (!itemIDs || itemIDs.length === 0) {
    throw new Error('itemIDs array cannot be empty');
  }

  if (itemIDs.length > MAX_ITEMS_PER_CALL) {
    throw new Error(`Cannot fetch more than ${MAX_ITEMS_PER_CALL} items in a single API call`);
  }

  // Build URL
  const itemIDsString = itemIDs.join(',');
  let url = `${UNIVERSALIS_API_BASE}/${worldName}/${itemIDsString}`;

  // Add query parameters
  const queryParams = [];
  if (listingsLimit !== null && listingsLimit !== undefined) {
    queryParams.push(`listings=${listingsLimit}`);
  }
  if (entriesLimit !== null && entriesLimit !== undefined) {
    queryParams.push(`entries=${entriesLimit}`);
  }

  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }

  console.log(`[Universalis API] Fetching: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Universalis API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Universalis API] Success: ${itemIDs.length} items`);
    return data;
  } catch (error) {
    console.error(`[Universalis API] Error:`, error.message);
    throw error;
  }
}

/**
 * Fetch market data for multiple items with batching
 * @param {number[]} itemIDs - Array of item IDs
 * @param {string} worldName - World/data center name
 * @param {number} listingsLimit - Limit for listings per item
 * @param {number} entriesLimit - Limit for recent history entries per item
 * @returns {Promise<Object>} Combined market data
 */
async function fetchMarketDataBatched(itemIDs, worldName = 'China', listingsLimit = 5, entriesLimit = 5) {
  const batches = [];
  for (let i = 0; i < itemIDs.length; i += MAX_ITEMS_PER_CALL) {
    batches.push(itemIDs.slice(i, i + MAX_ITEMS_PER_CALL));
  }

  const allItems = {};
  const allItemIDs = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Add delay before each API call (except the first one)
    if (i > 0) {
      console.log(`[Universalis API] Waiting ${DELAY_BETWEEN_CALLS_MS}ms before next batch...`);
      await delay(DELAY_BETWEEN_CALLS_MS);
    }

    const batchData = await fetchMarketData(batch, worldName, listingsLimit, entriesLimit);

    // Handle single item response
    if (batchData.itemID !== undefined) {
      allItems[batchData.itemID] = batchData;
      allItemIDs.push(batchData.itemID);
    }
    // Handle multiple items response
    else if (batchData.items && typeof batchData.items === 'object') {
      if (batchData.itemIDs) {
        allItemIDs.push(...batchData.itemIDs);
      }
      for (const [itemID, itemData] of Object.entries(batchData.items)) {
        allItems[itemID] = itemData;
      }
    }
  }

  return {
    itemIDs: allItemIDs,
    items: allItems,
  };
}

export {
  fetchMarketData,
  fetchMarketDataBatched,
  MAX_ITEMS_PER_CALL,
  DELAY_BETWEEN_CALLS_MS,
};
