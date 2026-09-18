/**
 * Item Market Service
 *
 * Loads the item list from JSON and fetches market data straight from the
 * Universalis API. The backend is not in this path - it only supplies the
 * classification index (see backendApi.js).
 */

import { getItemMarketData } from './universalis.js';
import { logUserRequest } from './logger.js';
import itemListData from '../assets/itemlist.json';

const DEFAULT_LISTINGS_LIMIT = 5; // Limit listings per item to reduce network load
// History entries are what make this endpoint slow: at data-center scope, 100 items
// with entries=0 return in ~2s, while 20 items with entries=20 time out. We display
// listings and prices, and sale velocity comes from the backend index, so no
// history is needed at all.
const DEFAULT_ENTRIES_LIMIT = 0;
// Falls back only if the backend index does not name one. Must be a world or data
// center - regions span too many worlds and time out.
const DEFAULT_WORLD_NAME = '猫小胖';

/**
 * Loads the item list from the JSON file
 * @returns {Array} Array of item objects with id, name, number, and req properties
 */
export function loadItemList() {
  return itemListData;
}

/**
 * Builds a lookup of itemID -> item metadata from the bundled item list
 * @returns {Map<number, Object>} Map of item ID to item metadata
 */
export function getItemListMap() {
  return new Map(loadItemList().map(item => [item.id, item]));
}

/**
 * Fetches market data for a specific set of item IDs.
 * Batching, rate limiting and progress reporting are handled by getItemMarketData.
 * @param {number[]} itemIDs - Item IDs to fetch
 * @param {Object} [options] - Fetch options
 * @param {string} [options.worldName] - World/data center name
 * @param {number} [options.listingsLimit] - Limit for listings per item
 * @param {number} [options.entriesLimit] - Limit for recent history entries per item
 * @param {Function|null} [options.progressCallback] - Called with progress 0-100
 * @param {Function|null} [options.onBatch] - Called with each batch's items as it
 *   lands, so the UI can fill in progressively
 * @returns {Promise<Object>} Object mapping item IDs to parsed market data
 */
export async function fetchMarketDataForIds(itemIDs, options = {}) {
  const {
    worldName = DEFAULT_WORLD_NAME,
    listingsLimit = DEFAULT_LISTINGS_LIMIT,
    entriesLimit = DEFAULT_ENTRIES_LIMIT,
    progressCallback = null,
    onBatch = null,
  } = options;

  if (!itemIDs || itemIDs.length === 0) {
    return {};
  }

  const effectiveWorldName = worldName || DEFAULT_WORLD_NAME;

  logUserRequest({
    worldName: effectiveWorldName,
    listingsLimit,
    entriesLimit,
    itemCount: itemIDs.length,
  });

  const marketData = await getItemMarketData(
    itemIDs,
    effectiveWorldName,
    listingsLimit,
    entriesLimit,
    progressCallback,
    null,
    onBatch
  );

  // A single-item request returns the parsed item directly
  if (marketData.itemID !== undefined) {
    return { [marketData.itemID]: marketData };
  }

  return marketData.items || {};
}

/**
 * Fetches market data for the given item IDs and attaches it to their metadata
 * from the bundled item list.
 * @param {number[]} itemIDs - Item IDs to fetch
 * @param {Object} [options] - Fetch options, see fetchMarketDataForIds
 * @returns {Promise<Array>} Array of items with a marketData property attached
 */
export async function getItemsWithMarketData(itemIDs, options = {}) {
  const marketData = await fetchMarketDataForIds(itemIDs, options);
  const itemsById = getItemListMap();

  return itemIDs.map(id => {
    const info = itemsById.get(id);
    return {
      id,
      name: info?.name || `Item ${id}`,
      number: info?.number || [],
      req: info?.req || [],
      marketData: marketData[id] || marketData[String(id)] || null,
    };
  });
}
