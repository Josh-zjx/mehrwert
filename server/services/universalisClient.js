/**
 * Universalis API Client
 *
 * Handles API calls to Universalis with global rate limiting.
 *
 * The sweep uses the /aggregated endpoint exclusively. It serves cached values and
 * the docs mark it "strongly preferred over CurrentlyShown if individual
 * sales/listings are not required" - which is exactly our case, since the index
 * only needs a sale velocity. It also accepts 100 item IDs per call and answers in
 * ~2-4s, where CurrentlyShown times out past ~10 items at data-center scope.
 */

import { delay } from '../utils/common.js';

const UNIVERSALIS_API_BASE = 'https://universalis.app/api/v2';
const MAX_ITEMS_PER_CALL = 100;
const BASE_DELAY_BETWEEN_CALLS_MS = 1000; // Base 1 second delay
const RANDOM_DELAY_MAX_MS = 500; // Random extra delay up to 500ms
const USER_AGENT = 'mehrwert (+https://github.com/Josh-zjx/mehrwert)';

/**
 * Global request queue for rate limiting
 * Ensures all Universalis API requests respect the rate limit globally
 */
class UniversalisRequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
  }

  /**
   * Get randomized delay between API calls
   * Base delay + random extra delay to avoid synchronized requests
   * @returns {number} Total delay in milliseconds
   */
  getRandomizedDelay() {
    const randomExtra = Math.floor(Math.random() * RANDOM_DELAY_MAX_MS);
    return BASE_DELAY_BETWEEN_CALLS_MS + randomExtra;
  }

  /**
   * Add a request to the queue and process it when rate limit allows
   * @param {Function} requestFn - Function that returns a Promise for the API request
   * @returns {Promise} Promise that resolves with the request result
   */
  async enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the request queue respecting rate limits
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();

      try {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredDelay = this.getRandomizedDelay();

        if (timeSinceLastRequest < requiredDelay) {
          await delay(requiredDelay - timeSinceLastRequest);
        }

        const result = await requestFn();
        this.lastRequestTime = Date.now();
        resolve(result);
      } catch (error) {
        this.lastRequestTime = Date.now();
        reject(error);
      }
    }

    this.processing = false;
  }
}

const requestQueue = new UniversalisRequestQueue();

/**
 * Fetch aggregated market data for items from Universalis.
 * @param {number[]} itemIDs - Array of item IDs (max 100)
 * @param {string} worldName - World or data center name. Use a data center: a
 *   region (China, North-America, ...) spans too many worlds and times out.
 * @returns {Promise<Object>} Aggregated response with a `results` array
 */
async function fetchAggregated(itemIDs, worldName) {
  if (!itemIDs || itemIDs.length === 0) {
    throw new Error('itemIDs array cannot be empty');
  }

  if (itemIDs.length > MAX_ITEMS_PER_CALL) {
    throw new Error(`Cannot fetch more than ${MAX_ITEMS_PER_CALL} items in a single API call`);
  }

  const url = `${UNIVERSALIS_API_BASE}/aggregated/${encodeURIComponent(worldName)}/${itemIDs.join(',')}`;

  return requestQueue.enqueue(async () => {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

    if (!response.ok) {
      const error = new Error(`Universalis API error: ${response.status} ${response.statusText}`);
      // Callers use this to decide whether a failure is worth retrying
      error.status = response.status;
      throw error;
    }

    return await response.json();
  });
}

/**
 * Fetch the list of data centers Universalis knows about.
 * This is the authoritative answer to "which data centers are supported" - we never
 * hardcode the game's topology, so new data centers appear without a code change.
 * @returns {Promise<Array<{name: string, region: string, worlds: number[]}>>}
 */
async function fetchDataCenters() {
  return requestQueue.enqueue(async () => {
    const response = await fetch(`${UNIVERSALIS_API_BASE}/data-centers`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      const error = new Error(`Universalis API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  });
}

export {
  fetchAggregated,
  fetchDataCenters,
  MAX_ITEMS_PER_CALL,
};
