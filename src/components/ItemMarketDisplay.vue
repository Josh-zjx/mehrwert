<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { fetchIndex, fetchDataCenters } from '../services/backendApi.js';
import { fetchMarketDataForIds, getItemListMap } from '../services/itemMarketService.js';
import { formatDate, formatNumber, formatRelativeTime } from '../utils/format.js';
import { byExpectedProfit } from '../utils/profit.js';
import ClassificationSection from './ClassificationSection.vue';
import FloatingHeader from './FloatingHeader.vue';
import { useTheme } from '../composables/useTheme.js';

const CLASSIFICATIONS = ['hot', 'mild', 'cold'];
const LABELS = { hot: 'Hot', mild: 'Mild', cold: 'Cold' };

// Item names/metadata are bundled with the frontend - the backend only tells us
// how active each item is, and the market data comes straight from Universalis.
const itemsById = getItemListMap();

const { isDark, toggleTheme } = useTheme();

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
      // The largest of the item's listed quantities: how many one expects to sell
      quantity: info.number?.at(-1) ?? null,
      velocity: typeof velocities[id] === 'number' ? velocities[id] : null,
      marketData: marketData.value[id] || null,
    }))
    .sort((a, b) => (b.velocity ?? -1) - (a.velocity ?? -1));

  ranked.forEach((item, position) => {
    const sells = item.velocity > 0;
    item.rank = sells ? position + 1 : null;

    // An item with no recorded sales is never hot, however few items are indexed
    if (position < hotLimit && sells) {
      groups.hot.push(item);
    } else if (item.velocity >= mildThreshold) {
      groups.mild.push(item);
    } else {
      groups.cold.push(item);
    }
  });

  // Hot is the list people act on, so it is ordered by what selling pays. The
  // backend's velocity ranking still decides membership (and the rank shown on
  // each card); mild and cold keep that order as-is. Reorders live as prices land.
  groups.hot.sort(byExpectedProfit);

  return groups;
});

const subtitle = (classification) => {
  if (!index.value) return '';
  const { hotLimit, mildThreshold } = index.value;
  if (classification === 'hot') return `Top ${hotLimit} by daily sales`;
  if (classification === 'mild') return `≥ ${mildThreshold} sold/day`;
  return `< ${mildThreshold} sold/day`;
};

// The four summary tiles: the whole list, then one per class
const summary = computed(() => {
  if (!index.value) return [];

  const indexNote = index.value.sweeping
    ? `sweeping ${formatNumber(index.value.indexed)} / ${formatNumber(index.value.total)}`
    : `index updated ${formatRelativeTime(index.value.updatedAt)}`;

  return [
    { key: 'total', label: 'Tracked items', value: itemsById.size, note: indexNote },
    ...CLASSIFICATIONS.map(c => ({
      key: c,
      label: LABELS[c],
      value: organizedItems.value[c].length,
      note: subtitle(c),
    })),
  ];
});

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
  <div class="market">
    <FloatingHeader :region="region" :data-center="dataCenter" />

    <header class="page-head">
      <div class="title-block">
        <span class="eyebrow">Mehrwert</span>
        <h1 class="title">Item Market</h1>
        <p class="lede">
          Live prices from Universalis. Items ranked by daily sales on the selected data
          center &mdash; players cannot trade across them.
        </p>
      </div>

      <div class="controls">
        <button
          type="button"
          class="theme"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
        <template v-if="regions.length > 0">
        <label class="field">
          <span class="field-label">Region</span>
          <select class="select" :value="region" @change="selectRegion($event.target.value)">
            <option v-for="r in regions" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Data center</span>
          <select class="select" :value="dataCenter" @change="selectDataCenter($event.target.value)">
            <option v-for="dc in dataCentersInRegion" :key="dc.name" :value="dc.name">
              {{ dc.name }}<template v-if="dc.indexed === 0"> (not indexed yet)</template>
            </option>
          </select>
        </label>
        <button type="button" class="refresh" :disabled="loading" @click="loadMarketData">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        </template>
      </div>
    </header>

    <section v-if="summary.length" class="summary" aria-label="Summary">
      <div v-for="tile in summary" :key="tile.key" class="tile" :class="tile.key">
        <span class="tile-label"><span class="dot" />{{ tile.label }}</span>
        <span class="tile-value">{{ formatNumber(tile.value) }}</span>
        <span class="tile-note" :title="tile.key === 'total' ? formatDate(index.updatedAt) : undefined">
          {{ tile.note }}
        </span>
      </div>
    </section>

    <p v-if="error" class="error" role="alert">Error: {{ error }}</p>

    <p v-if="loading" class="notice">Loading item index from backend…</p>

    <p v-else-if="index && index.indexed === 0" class="notice">
      {{ dataCenter }} has not been indexed yet. The server has been asked to sweep it
      next &mdash; this takes about half a minute. Refresh shortly.
    </p>

    <div v-else-if="index" class="sections">
      <ClassificationSection
        v-for="c in CLASSIFICATIONS"
        :key="c"
        :classification="c"
        :label="LABELS[c]"
        :subtitle="subtitle(c)"
        :items="organizedItems[c]"
        :note="c === 'hot' ? 'sorted by expected profit' : ''"
        :expanded="expandedCards[c]"
        :loading="loadingClassifications[c]"
        :progress="progress[c]"
        @toggle="toggleCard(c)"
      />
    </div>
  </div>
</template>

<style scoped>
.market {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 24px 32px;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 40rem;
}

.eyebrow {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 40px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.lede {
  color: var(--muted);
}

.controls {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 10rem;
}

.field-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.select {
  height: 44px;
  width: 100%;
  min-width: 10rem;
  padding: 0 40px 0 14px;
  font-weight: 500;
  background:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b665c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")
    no-repeat right 14px center;
  background-color: var(--surface);
  border: 2px solid var(--hairline);
  border-radius: var(--radius-control);
  appearance: none;
  cursor: pointer;
}

.theme {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--muted);
  background: var(--surface);
  border: 2px solid var(--hairline);
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.theme:hover {
  color: var(--ink);
  border-color: var(--line);
}

.refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-inverse);
  background: var(--ink);
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: opacity 0.2s;
}

.refresh:hover:not(:disabled) {
  opacity: 0.85;
}

.refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 22px;
  background: var(--surface);
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-card);
}

.tile.hot {
  --class: var(--hot);
}

.tile.mild {
  --class: var(--mild);
}

.tile.cold {
  --class: var(--cold);
}

.tile-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--class, var(--muted));
}

.dot {
  display: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--class);
}

.tile.hot .dot,
.tile.mild .dot,
.tile.cold .dot {
  display: inline-block;
}

.tile-value {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
}

.tile-note {
  font-size: 13px;
  color: var(--muted);
}

.error {
  padding: 12px 16px;
  color: var(--danger);
  background: var(--danger-tint);
  border-radius: 14px;
}

.notice {
  padding: 32px 0;
  text-align: center;
  color: var(--muted);
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

@media (max-width: 640px) {
  .page-head {
    align-items: stretch;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .refresh {
    order: 1;
    justify-content: center;
  }

  .theme {
    order: 2;
    justify-self: end;
  }

  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .tile {
    padding: 14px 16px;
  }

  .tile-value {
    font-size: 26px;
  }
}
</style>
