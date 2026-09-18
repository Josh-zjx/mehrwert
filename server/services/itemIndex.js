/**
 * Item Index
 *
 * Maintains a classification index per data center: itemID -> units sold per day,
 * refreshed by a rotating sweep across every data center Universalis knows about.
 *
 * The server does NOT cache market data for display. Clients fetch listings and
 * prices from Universalis directly; this index only tells them which items are
 * worth fetching, and how to group them.
 *
 * Everything is scoped to a data center. Players cannot trade across data centers,
 * so a region-wide figure is not actionable - and region queries time out anyway.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchAggregated, MAX_ITEMS_PER_CALL } from './universalisClient.js';
import { getDataCenterNames, isKnownDataCenter } from './dataCenters.js';
import { delay } from '../utils/common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../../data');
const INDEX_PATH = join(DATA_DIR, 'index.json');

// Classification policy. The client receives these in the index payload and
// derives both the grouping and the card labels from them, so this is the single
// source of truth.
//
// "Hot" is a rank, not a threshold: the top N items by velocity. A threshold makes
// the hot set unbounded, which both floods the UI and makes the client's first
// fetch unpredictable. A rank keeps it to one request.
const HOT_LIMIT = Number(process.env.HOT_LIMIT) || 50;
// Mild/cold still use a rate threshold, in units sold per day.
const MILD_THRESHOLD = Number(process.env.MILD_THRESHOLD) || 14;

// Universalis sits behind a gateway that times out around 11s. The aggregated
// endpoint is cached and normally answers in 2-4s, but a blip would otherwise leave
// a permanent hole in the index, so retry once.
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 3000;

const itemList = JSON.parse(
  readFileSync(join(__dirname, '../../src/assets/itemlist.json'), 'utf-8')
);
// itemlist.json contains a handful of duplicated entries; the index is keyed by
// item ID, so dedupe here to avoid re-fetching the same item within a sweep.
const ITEM_IDS = [...new Set(itemList.map(item => item.id))];

/** @type {Object<string, Object<string, number>>} data center -> itemID -> units/day */
let byDataCenter = {};
/** @type {Object<string, number>} data center -> when it was last swept */
let updatedAt = {};

let sweepingDc = null;
// Data centers a client asked for that have no data yet. A full rotation takes
// several minutes, so without this a user picking a fresh data center could wait
// that long; jumping the queue makes a first visit cost one sweep instead.
const priority = new Set();

/**
 * Split an array into fixed-size chunks
 * @param {Array} arr - Array to split
 * @param {number} size - Maximum chunk size
 * @returns {Array[]} Array of chunks
 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Read an item's data-center sale velocity out of an aggregated result.
 *
 * NQ and HQ are summed because an item traded mainly as HQ would otherwise look
 * dead. The data-center figure is used deliberately, never the region one.
 * @param {Object} result - One entry from the aggregated response's results array
 * @returns {number} Units sold per day, 0 when the DC has no recorded sales
 */
function dailyVelocity(result) {
  const nq = result?.nq?.dailySaleVelocity?.dc?.quantity || 0;
  const hq = result?.hq?.dailySaleVelocity?.dc?.quantity || 0;
  return nq + hq;
}

/**
 * Is a failed request worth retrying? Gateway errors, rate limiting and network
 * faults are transient; a 4xx about the request itself is not.
 * @param {Error} error - Error thrown by fetchAggregated
 * @returns {boolean} True if the request should be retried
 */
function isRetryable(error) {
  if (!error.status) return true; // network/DNS/abort - no response came back
  return error.status === 429 || error.status >= 500;
}

/**
 * Fetch one batch, retrying transient failures with a linear backoff
 * @param {number[]} batch - Item IDs to fetch
 * @param {string} dataCenter - Data center name
 * @returns {Promise<Object>} Universalis aggregated response
 */
async function fetchBatchWithRetry(batch, dataCenter) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchAggregated(batch, dataCenter);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await delay(RETRY_BACKOFF_MS * attempt);
    }
  }

  throw lastError;
}

/**
 * Load a previously persisted index from disk, if one exists
 * @returns {void}
 */
function loadIndex() {
  if (!existsSync(INDEX_PATH)) {
    console.log(`[Index] No saved index at ${INDEX_PATH} - starting empty`);
    return;
  }

  try {
    const saved = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    byDataCenter = saved.byDataCenter || {};
    updatedAt = saved.updatedAt || {};
    const dcs = Object.keys(byDataCenter).length;
    console.log(`[Index] Loaded ${dcs} data centers from ${INDEX_PATH}`);
  } catch (error) {
    console.error(`[Index] Failed to load saved index:`, error.message);
    byDataCenter = {};
    updatedAt = {};
  }
}

/**
 * Persist the current index to disk so a restart has data immediately
 * @returns {void}
 */
function saveIndex() {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(INDEX_PATH, JSON.stringify({ updatedAt, byDataCenter }));
  } catch (error) {
    console.error(`[Index] Failed to save index:`, error.message);
  }
}

/**
 * Run one full sweep over every item for a single data center.
 * Entries update as each batch lands, so the index is usable while a sweep runs.
 * @param {string} dataCenter - Data center name
 * @returns {Promise<void>}
 */
async function sweep(dataCenter) {
  sweepingDc = dataCenter;
  const startedAt = Date.now();
  const batches = chunk(ITEM_IDS, MAX_ITEMS_PER_CALL);
  const velocities = byDataCenter[dataCenter] || (byDataCenter[dataCenter] = {});
  let failed = 0;

  try {
    for (const batch of batches) {
      try {
        const data = await fetchBatchWithRetry(batch, dataCenter);

        for (const result of data.results || []) {
          velocities[result.itemId] = dailyVelocity(result);
        }
      } catch (error) {
        failed += batch.length;
        console.error(`[Index] ${dataCenter}: batch failed:`, error.message);
        // Keep the previous value for these items and move on
      }
    }

    updatedAt[dataCenter] = Date.now();
    saveIndex();

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[Index] ${dataCenter}: swept ${Object.keys(velocities).length} items in ${elapsed}s` +
        (failed > 0 ? `, ${failed} items failed` : '')
    );
  } finally {
    sweepingDc = null;
    priority.delete(dataCenter);
  }
}

/**
 * Pick the next data center to sweep: anything a client is waiting on first,
 * otherwise continue the rotation, oldest data first.
 * @returns {string|undefined} Data center name
 */
function nextDataCenter() {
  for (const dc of priority) {
    if (isKnownDataCenter(dc)) return dc;
    priority.delete(dc);
  }

  const names = getDataCenterNames();
  if (names.length === 0) return undefined;

  // Never-swept data centers first, then whichever was swept longest ago
  return [...names].sort((a, b) => (updatedAt[a] || 0) - (updatedAt[b] || 0))[0];
}

/**
 * Start the sweep loop. Sweeps one data center at a time, forever, pausing
 * `intervalMs` only after a full rotation so sweeps never overlap.
 * @param {number} intervalMs - Idle time after every data center has been swept
 * @returns {void}
 */
function startSweeping(intervalMs) {
  let sweptThisRotation = 0;

  const loop = async () => {
    const dataCenter = nextDataCenter();
    let wait = 0;

    if (!dataCenter) {
      wait = intervalMs;
    } else {
      try {
        await sweep(dataCenter);
      } catch (error) {
        console.error(`[Index] Sweep error for ${dataCenter}:`, error.message);
      }

      // Pause only once the whole rotation is done, unless someone is waiting
      sweptThisRotation += 1;
      if (sweptThisRotation >= getDataCenterNames().length && priority.size === 0) {
        sweptThisRotation = 0;
        wait = intervalMs;
        console.log(`[Index] Rotation complete - idling ${intervalMs / 1000}s`);
      }
    }

    setTimeout(loop, wait).unref?.();
  };

  loop();
}

/**
 * Note that a client wants this data center, so the sweep can prioritise it.
 * @param {string} dataCenter - Data center name
 * @returns {void}
 */
function requestDataCenter(dataCenter) {
  if (!byDataCenter[dataCenter] && isKnownDataCenter(dataCenter)) {
    priority.add(dataCenter);
  }
}

/**
 * Get the index payload for one data center
 * @param {string} dataCenter - Data center name
 * @returns {Object} Index payload
 */
function getIndex(dataCenter) {
  const velocities = byDataCenter[dataCenter] || {};

  return {
    dataCenter,
    updatedAt: updatedAt[dataCenter] || null,
    sweeping: sweepingDc === dataCenter,
    total: ITEM_IDS.length,
    indexed: Object.keys(velocities).length,
    hotLimit: HOT_LIMIT,
    mildThreshold: MILD_THRESHOLD,
    velocities,
  };
}

/**
 * How many items are indexed for each data center, for the picker to show progress
 * @returns {Object<string, {indexed: number, updatedAt: number|null}>}
 */
function getCoverage() {
  const coverage = {};

  for (const name of getDataCenterNames()) {
    const velocities = byDataCenter[name];
    coverage[name] = {
      indexed: velocities ? Object.keys(velocities).length : 0,
      // Data centers with no recorded sales at all (e.g. beta ones) index as zeros
      active: velocities ? Object.values(velocities).some(v => v > 0) : false,
      updatedAt: updatedAt[name] || null,
    };
  }

  return coverage;
}

export {
  loadIndex,
  startSweeping,
  sweep,
  getIndex,
  getCoverage,
  requestDataCenter,
  dailyVelocity,
  HOT_LIMIT,
  MILD_THRESHOLD,
  ITEM_IDS,
};
