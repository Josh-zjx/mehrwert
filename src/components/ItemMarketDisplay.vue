<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { fetchIndex, fetchDataCenters } from '../services/backendApi.js';
import { fetchMarketDataForIds, getItemListMap } from '../services/itemMarketService.js';

const CLASSIFICATIONS = ['hot', 'mild', 'cold'];
const LABELS = { hot: 'Hot', mild: 'Mild', cold: 'Cold' };

// Item names/metadata are bundled with the frontend - the backend only tells us
// how active each item is, and the market data comes straight from Universalis.
const itemsById = getItemListMap();

const catalog = ref(null);
const region = ref(null);
const dataCenter = ref(null);
const index = ref(null);
const marketData = ref({});
const loading = ref(true);
const error = ref(null);
const expandedCards = ref({ hot: true, mild: false, cold: false });
const loadedClassifications = ref(new Set());
const loadingClassifications = ref({ hot: false, mild: false, cold: false });
const progress = ref({ hot: 0, mild: 0, cold: 0 });
const expandedListings = ref({});

const formatPrice = (price) => {
  if (price === null || price === undefined || price === 0) return 'N/A';
  return price.toLocaleString('en-US');
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return value.toLocaleString('en-US');
};

const formatVelocity = (velocity) => {
  if (velocity === null || velocity === undefined) return 'N/A';
  if (velocity >= 100) return Math.round(velocity).toLocaleString('en-US');
  return velocity.toFixed(1);
};

// Regions in the order Universalis lists them, each with its data centers.
// Data centers with no recorded sales at all (beta ones) are hidden - they would
// render as an entirely empty page.
const regions = computed(() => {
  if (!catalog.value) return [];

  const byRegion = new Map();
  for (const dc of catalog.value.dataCenters) {
    if (dc.indexed > 0 && !dc.active) continue;
    if (!byRegion.has(dc.region)) byRegion.set(dc.region, []);
    byRegion.get(dc.region).push(dc);
  }

  return [...byRegion].map(([name, dataCenters]) => ({ name, dataCenters }));
});

const dataCentersInRegion = computed(() => {
  return regions.value.find(r => r.name === region.value)?.dataCenters || [];
});

// Every item from the bundled list, ranked by sale velocity and grouped.
//
// Hot is the top `hotLimit` items by velocity rather than everything over a
// threshold. That keeps the set bounded, so opening the page is always one request
// no matter how busy the market is. Mild/cold fall out of a rate threshold.
// Items the backend has not swept yet have no velocity and sort to the bottom.
const organizedItems = computed(() => {
  const groups = { hot: [], mild: [], cold: [] };
  if (!index.value) return groups;

  const { velocities, hotLimit, mildThreshold } = index.value;

  const ranked = [...itemsById]
    .map(([id, info]) => ({
      id,
      name: info.name,
      velocity: typeof velocities[id] === 'number' ? velocities[id] : null,
      marketData: marketData.value[id] || null,
    }))
    .sort((a, b) => (b.velocity ?? -1) - (a.velocity ?? -1));

  ranked.forEach((item, rank) => {
    // An item with no recorded sales is never hot, however few items are indexed
    if (rank < hotLimit && item.velocity > 0) {
      groups.hot.push(item);
    } else if (item.velocity >= mildThreshold) {
      groups.mild.push(item);
    } else {
      groups.cold.push(item);
    }
  });

  return groups;
});

const stats = computed(() => ({
  total: itemsById.size,
  hot: organizedItems.value.hot.length,
  mild: organizedItems.value.mild.length,
  cold: organizedItems.value.cold.length,
}));

const subtitle = (classification) => {
  if (!index.value) return '';
  const { hotLimit, mildThreshold } = index.value;
  if (classification === 'hot') return `Top ${hotLimit} by daily sales`;
  if (classification === 'mild') return `≥ ${mildThreshold} sold/day`;
  return `< ${mildThreshold} sold/day`;
};

/**
 * Read the region and data center out of the URL so a page can be bookmarked.
 * @returns {{region: string|null, dc: string|null}}
 */
const readUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return { region: params.get('region'), dc: params.get('dc') };
};

/**
 * Reflect the current selection in the URL without reloading the page.
 * @param {boolean} replace - Replace the entry instead of pushing a new one
 */
const writeUrl = (replace = false) => {
  if (!region.value || !dataCenter.value) return;

  const params = new URLSearchParams(window.location.search);
  params.set('region', region.value);
  params.set('dc', dataCenter.value);

  const url = `${window.location.pathname}?${params}`;
  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
};

/**
 * Resolve a region/data center pair against the catalog, falling back to the
 * backend's default when the URL names something that does not exist.
 * @param {string|null} wantedRegion - Region from the URL
 * @param {string|null} wantedDc - Data center from the URL
 * @returns {{region: string, dc: string}|null}
 */
const resolveSelection = (wantedRegion, wantedDc) => {
  const all = regions.value.flatMap(r => r.dataCenters);
  if (all.length === 0) return null;

  // A data center name is unique, so it alone is enough to place the region
  const match = all.find(dc => dc.name === wantedDc);
  if (match) return { region: match.region, dc: match.name };

  const inRegion = regions.value.find(r => r.name === wantedRegion)?.dataCenters[0];
  if (inRegion) return { region: inRegion.region, dc: inRegion.name };

  const fallback =
    all.find(dc => dc.name === catalog.value?.defaultDataCenter) || all[0];
  return { region: fallback.region, dc: fallback.name };
};

const loadClassification = async (classification) => {
  if (loadingClassifications.value[classification]) return;

  const ids = organizedItems.value[classification].map(item => item.id);
  if (ids.length === 0) {
    loadedClassifications.value.add(classification);
    return;
  }

  loadingClassifications.value[classification] = true;
  progress.value[classification] = 0;
  error.value = null;

  const requestedFor = dataCenter.value;

  try {
    await fetchMarketDataForIds(ids, {
      worldName: dataCenter.value,
      progressCallback: (value) => {
        progress.value[classification] = value;
      },
      // Render each batch as it arrives rather than waiting for the whole category
      onBatch: (items) => {
        // Drop late results if the user switched data center mid-flight
        if (requestedFor !== dataCenter.value) return;
        marketData.value = { ...marketData.value, ...items };
      },
    });

    if (requestedFor === dataCenter.value) {
      loadedClassifications.value.add(classification);
    }
  } catch (err) {
    error.value = err.message || `Failed to load ${classification} market data from Universalis`;
    console.error(`Error loading ${classification} market data:`, err);
  } finally {
    loadingClassifications.value[classification] = false;
  }
};

const toggleCard = async (classification) => {
  expandedCards.value[classification] = !expandedCards.value[classification];

  if (expandedCards.value[classification] && !loadedClassifications.value.has(classification)) {
    await loadClassification(classification);
  }
};

const toggleListings = (itemID) => {
  expandedListings.value[itemID] = !expandedListings.value[itemID];
};

/**
 * Load the index for the selected data center, then the open categories.
 */
const loadMarketData = async () => {
  loading.value = true;
  error.value = null;
  marketData.value = {};
  loadedClassifications.value = new Set();

  const requestedFor = dataCenter.value;

  try {
    index.value = await fetchIndex(dataCenter.value);
  } catch (err) {
    error.value = err.message || 'Failed to load the item index from the backend';
    console.error('Error loading index:', err);
    loading.value = false;
    return;
  }

  loading.value = false;
  if (requestedFor !== dataCenter.value) return;

  // Fetch market data for whatever is already open, hot by default
  for (const classification of CLASSIFICATIONS.filter(c => expandedCards.value[c])) {
    await loadClassification(classification);
  }
};

const selectRegion = async (name) => {
  if (name === region.value) return;
  region.value = name;
  dataCenter.value = dataCentersInRegion.value[0]?.name || null;
  writeUrl();
  await loadMarketData();
};

const selectDataCenter = async (name) => {
  if (name === dataCenter.value) return;
  dataCenter.value = name;
  writeUrl();
  await loadMarketData();
};

/**
 * Apply whatever the URL says, used on first load and on browser back/forward.
 */
const applyUrl = async (replace) => {
  const { region: urlRegion, dc: urlDc } = readUrl();
  const resolved = resolveSelection(urlRegion, urlDc);
  if (!resolved) return;

  if (resolved.region === region.value && resolved.dc === dataCenter.value) return;

  region.value = resolved.region;
  dataCenter.value = resolved.dc;
  writeUrl(replace);
  await loadMarketData();
};

const onPopState = () => {
  applyUrl(true);
};

onMounted(async () => {
  try {
    catalog.value = await fetchDataCenters();
  } catch (err) {
    error.value = err.message || 'Failed to load data centers from the backend';
    loading.value = false;
    return;
  }

  window.addEventListener('popstate', onPopState);
  await applyUrl(true);
});

onUnmounted(() => {
  window.removeEventListener('popstate', onPopState);
});
</script>

<template>
  <div class="item-market-display">
    <div class="header">
      <h2>Item Market Information</h2>
      <div class="controls">
        <button @click="loadMarketData" :disabled="loading" class="refresh-btn">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="regions.length > 0" class="selector-bar">
      <div class="selector">
        <label class="selector-label" for="region-select">Region</label>
        <select
          id="region-select"
          class="selector-input"
          :value="region"
          @change="selectRegion($event.target.value)"
        >
          <option v-for="r in regions" :key="r.name" :value="r.name">{{ r.name }}</option>
        </select>
      </div>
      <div class="selector">
        <label class="selector-label" for="dc-select">Data Center</label>
        <select
          id="dc-select"
          class="selector-input"
          :value="dataCenter"
          @change="selectDataCenter($event.target.value)"
        >
          <option v-for="dc in dataCentersInRegion" :key="dc.name" :value="dc.name">
            {{ dc.name }}<template v-if="dc.indexed === 0"> (not indexed yet)</template>
          </option>
        </select>
      </div>
      <p class="selector-note">
        Prices are per data center &mdash; players cannot trade across them.
      </p>
    </div>

    <div v-if="index" class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">Total:</span>
        <span class="stat-value">{{ stats.total }}</span>
      </div>
      <div v-for="c in CLASSIFICATIONS" :key="c" class="stat-item" :class="c">
        <span class="stat-label">{{ LABELS[c] }}:</span>
        <span class="stat-value">{{ stats[c] }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Index updated:</span>
        <span class="stat-value">{{ formatDate(index.updatedAt) }}</span>
      </div>
      <div v-if="index.sweeping" class="stat-item">
        <span class="stat-label">Sweeping:</span>
        <span class="stat-value">{{ index.indexed }} / {{ index.total }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      Error: {{ error }}
    </div>

    <div v-if="loading" class="loading">
      Loading item index from backend...
    </div>

    <div v-else-if="index && index.indexed === 0" class="loading">
      {{ dataCenter }} has not been indexed yet. The server has been asked to sweep it
      next &mdash; this takes about half a minute. Refresh shortly.
    </div>

    <div v-else class="items-container">
      <div
        v-for="c in CLASSIFICATIONS"
        :key="c"
        class="classification-card"
        :class="`${c}-card`"
      >
        <div class="card-header" @click="toggleCard(c)">
          <div class="card-title">
            <span class="classification-badge" :class="`${c}-badge`">{{ LABELS[c] }}</span>
            <span class="card-count">({{ organizedItems[c].length }} items)</span>
          </div>
          <div class="card-subtitle">{{ subtitle(c) }}</div>
          <span class="card-toggle">{{ expandedCards[c] ? '▼' : '▶' }}</span>
        </div>

        <div v-if="expandedCards[c]" class="card-content">
          <div v-if="loadingClassifications[c]" class="loading-items">
            Fetching prices from Universalis... {{ progress[c] }}%
          </div>
          <div v-if="!loadingClassifications[c] && organizedItems[c].length === 0" class="no-items">
            No {{ c }} items found
          </div>
          <div v-else class="items-grid">
            <div
              v-for="item in organizedItems[c]"
              :key="item.id"
              class="item-card"
              :class="{ 'no-data': !item.marketData || !item.marketData.hasData }"
            >
              <div class="item-header">
                <div class="item-name-section">
                  <h3 class="item-name">{{ item.name }}</h3>
                  <a
                    :href="`https://universalis.app/market/${item.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="item-link"
                    title="View on Universalis"
                  >
                    🔗
                  </a>
                </div>
                <span class="item-id">ID: {{ item.id }}</span>
              </div>

              <div v-if="!item.marketData" class="no-market-data">
                No market data available
              </div>

              <div v-else class="market-info">
                <div class="sale-velocity-badge">
                  <span class="velocity-label">Sold/day:</span>
                  <span class="velocity-value">{{ formatVelocity(item.velocity) }}</span>
                </div>

                <div class="price-section">
                  <div class="price-row">
                    <span class="price-label">Current Avg:</span>
                    <span class="price-value">{{ formatPrice(item.marketData.prices.currentAverage) }} gil</span>
                  </div>
                  <div class="price-row">
                    <span class="price-label">Min:</span>
                    <span class="price-value min-price">{{ formatPrice(item.marketData.prices.min) }} gil</span>
                  </div>
                </div>

                <div class="stats-section">
                  <div class="stat">
                    <span class="stat-label">Listings:</span>
                    <span class="stat-value">{{ formatNumber(item.marketData.listingsCount) }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">For Sale:</span>
                    <span class="stat-value">{{ formatNumber(item.marketData.unitsForSale) }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Sold/day:</span>
                    <span class="stat-value">{{ formatVelocity(item.velocity) }}</span>
                  </div>
                </div>

                <div v-if="item.marketData.listings && item.marketData.listings.length > 0" class="listings-section">
                  <div class="listings-header" @click="toggleListings(item.id)">
                    <span>Listings ({{ item.marketData.listings.length }})</span>
                    <span class="listings-toggle">{{ expandedListings[item.id] ? '▼' : '▶' }}</span>
                  </div>
                  <div v-if="expandedListings[item.id]" class="listings-content">
                    <div
                      v-for="(listing, i) in item.marketData.listings.slice(0, 5)"
                      :key="listing.listingID || i"
                      class="listing-item"
                    >
                      <span class="listing-price">{{ formatPrice(listing.pricePerUnit) }} gil</span>
                      <span class="listing-quantity">×{{ listing.quantity }}</span>
                      <span class="listing-total">{{ formatPrice(listing.total) }} gil</span>
                      <span class="listing-world">{{ listing.worldName }}</span>
                    </div>
                  </div>
                </div>

                <div class="update-info">
                  <span class="update-label">Last Upload:</span>
                  <span class="update-time">{{ formatDate(item.marketData.lastUploadTime) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-market-display {
  width: 100%;
  padding: 1rem;
}

.header {
  margin-bottom: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.header h2 {
  margin: 0;
  color: hsla(160, 100%, 37%, 1);
}

.controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.refresh-btn {
  padding: 0.5rem 1rem;
  background-color: hsla(160, 100%, 37%, 1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: hsla(160, 100%, 30%, 1);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.selector-bar {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.selector {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.selector-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.selector-input {
  padding: 0.45rem 0.6rem;
  font-size: 0.95rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: white;
  color: #2c3e50;
  min-width: 12rem;
  cursor: pointer;
}

.selector-input:focus {
  outline: 2px solid hsla(160, 100%, 37%, 1);
  outline-offset: -1px;
}

.selector-note {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  color: #888;
  flex: 1 1 14rem;
}

.stats-bar {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: white;
  border-radius: 4px;
  border-left: 4px solid #6c757d;
}

.stat-item.hot {
  border-left-color: #dc3545;
}

.stat-item.mild {
  border-left-color: #ffc107;
}

.stat-item.cold {
  border-left-color: #17a2b8;
}

.stat-label {
  font-weight: 600;
  color: #666;
}

.stat-value {
  font-weight: 700;
  color: #333;
}

.error-message {
  background-color: #fee;
  color: #c33;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.items-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.classification-card {
  border: 2px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.hot-card {
  border-color: #dc3545;
}

.mild-card {
  border-color: #ffc107;
}

.cold-card {
  border-color: #17a2b8;
}

.card-header {
  padding: 1rem 1.5rem;
  background-color: #f8f9fa;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
  user-select: none;
}

.card-header:hover {
  background-color: #e9ecef;
}

.hot-card .card-header {
  background-color: #fff5f5;
}

.mild-card .card-header {
  background-color: #fffbf0;
}

.cold-card .card-header {
  background-color: #f0f9ff;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.classification-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.9rem;
  text-transform: uppercase;
}

.hot-badge {
  background-color: #dc3545;
  color: white;
}

.mild-badge {
  background-color: #ffc107;
  color: #333;
}

.cold-badge {
  background-color: #17a2b8;
  color: white;
}

.card-count {
  font-weight: 600;
  color: #666;
  font-size: 0.9rem;
}

.card-subtitle {
  font-size: 0.85rem;
  color: #999;
  margin-top: 0.25rem;
}

.card-toggle {
  font-size: 1.2rem;
  color: #666;
  font-weight: bold;
}

.card-content {
  padding: 1.5rem;
}

.no-items {
  text-align: center;
  color: #999;
  padding: 2rem;
  font-style: italic;
}

.loading-items {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-weight: 500;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.item-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.item-card.no-data {
  opacity: 0.7;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid hsla(160, 100%, 37%, 0.2);
}

.item-name-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.item-name {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
}

.item-link {
  font-size: 1rem;
  text-decoration: none;
  color: hsla(160, 100%, 37%, 1);
  transition: transform 0.2s;
  display: inline-block;
}

.item-link:hover {
  transform: scale(1.2);
}

.item-id {
  font-size: 0.85rem;
  color: #666;
}

.no-market-data {
  color: #999;
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

.market-info {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sale-velocity-badge {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: #e7f3ff;
  border-radius: 4px;
  font-weight: 600;
}

.velocity-label {
  color: #666;
}

.velocity-value {
  color: #0066cc;
  font-size: 1.1rem;
}

.price-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.price-label {
  font-weight: 500;
  color: #666;
}

.price-value {
  font-weight: 600;
  color: #333;
}

.min-price {
  color: #28a745;
}


.stats-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.9rem;
}

.stat-label {
  color: #666;
  font-size: 0.85rem;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 1rem;
}

.listings-section {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
}

.listings-header {
  font-weight: 600;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;
  user-select: none;
}

.listings-header:hover {
  background-color: #f8f9fa;
}

.listings-toggle {
  font-size: 0.8rem;
  color: #999;
}

.listings-content {
  margin-top: 0.5rem;
  padding-left: 0.5rem;
}

.listing-item {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #f0f0f0;
}

.listing-item:last-child {
  border-bottom: none;
}

.listing-price {
  font-weight: 600;
  color: #333;
}

.listing-quantity {
  color: #666;
  text-align: right;
}

.listing-total {
  color: #666;
  font-size: 0.8rem;
  text-align: right;
}

.listing-world {
  color: #999;
  font-size: 0.8rem;
  text-align: right;
}

.update-info {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee;
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
}

.update-label {
  color: #666;
}

.update-time {
  color: #999;
}

@media (max-width: 768px) {
  .items-grid {
    grid-template-columns: 1fr;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-bar {
    flex-direction: column;
  }
}
</style>
