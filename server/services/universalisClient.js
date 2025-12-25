/**
 * Universalis API Client
 * 
 * Handles API calls to Universalis with global rate limiting
 */

import { delay, buildQueryString } from '../utils/common.js';

const UNIVERSALIS_API_BASE = 'https://universalis.app/api/v2';
const MAX_ITEMS_PER_CALL = 5;
const BASE_DELAY_BETWEEN_CALLS_MS = 1000; // Base 1 second delay
const RANDOM_DELAY_MAX_MS = 500; // Random extra delay up to 500ms
const ENTRIES_WITHIN_SECONDS = 604800; // 7 days in seconds

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
    // If already processing or queue is empty, return
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();

      try {
        // Calculate delay needed since last request
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredDelay = this.getRandomizedDelay();

        if (timeSinceLastRequest < requiredDelay) {
          const waitTime = requiredDelay - timeSinceLastRequest;
          await delay(waitTime);
        }

        // Execute the request
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

// Global request queue instance
const requestQueue = new UniversalisRequestQueue();

/**
 * Fetch market data for items from Universalis API
 * Uses global rate limiting queue
 * @param {number[]} itemIDs - Array of item IDs (max 5)
 * @param {string} worldName - World/data center name (default: 'China')
 * @param {number} listingsLimit - Limit for listings per item
 * @param {number} entriesLimit - Limit for recent history entries per item
 * @returns {Promise<Object>} Market data response
 */
async function fetchMarketData(itemIDs, worldName = 'China', listingsLimit = 5, entriesLimit = 20) {
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
  const params = {};
  if (listingsLimit !== null && listingsLimit !== undefined) {
    params.listings = listingsLimit;
  }
  if (entriesLimit !== null && entriesLimit !== undefined) {
    params.entries = entriesLimit;
  }
  // Always include entriesWithin to limit history to last 7 days
  params.entriesWithin = ENTRIES_WITHIN_SECONDS;

  url += buildQueryString(params);

  // Enqueue the request through global rate limiter
  return requestQueue.enqueue(async () => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Universalis API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  });
}

export {
  fetchMarketData,
  MAX_ITEMS_PER_CALL,
};
