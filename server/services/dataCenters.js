/**
 * Data Centers
 *
 * Resolves which data centers exist, straight from Universalis. The game's topology
 * is never hardcoded here - whatever Universalis serves is by definition what it
 * supports, so new data centers appear without a code change.
 *
 * Everything in this app is scoped to a data center, never a region: players cannot
 * trade across data centers, so region-wide prices are not actionable. Region
 * queries also span 30+ worlds and exceed Universalis' ~11s gateway timeout.
 */

import { fetchDataCenters } from './universalisClient.js';

// Used only if Universalis is unreachable at startup, so the server still boots and
// serves a previously persisted index. Refreshed from the API whenever it responds.
const FALLBACK = [
  { name: 'Elemental', region: 'Japan' },
  { name: 'Gaia', region: 'Japan' },
  { name: 'Mana', region: 'Japan' },
  { name: 'Meteor', region: 'Japan' },
  { name: 'Aether', region: 'North-America' },
  { name: 'Primal', region: 'North-America' },
  { name: 'Crystal', region: 'North-America' },
  { name: 'Dynamis', region: 'North-America' },
  { name: 'Chaos', region: 'Europe' },
  { name: 'Light', region: 'Europe' },
  { name: 'Materia', region: 'Oceania' },
  { name: '陆行鸟', region: '中国' },
  { name: '莫古力', region: '中国' },
  { name: '猫小胖', region: '中国' },
  { name: '豆豆柴', region: '中国' },
  { name: '한국', region: '한국' },
  { name: '陸行鳥', region: '繁中服' },
];

let dataCenters = FALLBACK.map(dc => ({ ...dc, worldCount: 0 }));

/**
 * Refresh the data center list from Universalis.
 * Falls back to the bundled snapshot if the API is unreachable.
 * @returns {Promise<void>}
 */
async function loadDataCenters() {
  try {
    const raw = await fetchDataCenters();

    const parsed = raw
      .filter(dc => dc?.name && dc?.region)
      .map(dc => ({
        name: dc.name,
        region: dc.region,
        worldCount: (dc.worlds || []).length,
      }));

    if (parsed.length === 0) {
      throw new Error('Universalis returned no data centers');
    }

    dataCenters = parsed;
    console.log(`[DataCenters] Loaded ${dataCenters.length} data centers from Universalis`);
  } catch (error) {
    console.error(`[DataCenters] Falling back to bundled list:`, error.message);
  }
}

/**
 * @returns {Array<{name: string, region: string, worldCount: number}>} All known data centers
 */
function getDataCenters() {
  return dataCenters;
}

/**
 * @returns {string[]} Every known data center name
 */
function getDataCenterNames() {
  return dataCenters.map(dc => dc.name);
}

/**
 * @param {string} name - Data center name
 * @returns {boolean} True if Universalis knows this data center
 */
function isKnownDataCenter(name) {
  return dataCenters.some(dc => dc.name === name);
}

export { loadDataCenters, getDataCenters, getDataCenterNames, isKnownDataCenter };
