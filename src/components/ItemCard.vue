<script setup>
import { ref, computed } from 'vue';
import {
  formatDate,
  formatNumber,
  formatPrice,
  formatRank,
  formatRelativeTime,
  formatVelocity,
} from '../utils/format.js';
import { cheapestListing, expectedProfit as profitOf } from '../utils/profit.js';

const LISTINGS_SHOWN = 5;

const props = defineProps({
  /** { id, name, rank, quantity, velocity, marketData } */
  item: { type: Object, required: true },
  /** True while this item's category is still being fetched */
  loading: { type: Boolean, default: false },
});

const listingsOpen = ref(false);

const market = computed(() => props.item.marketData);

// A card is in exactly one of three states: prices in hand, still on their way,
// or Universalis has nothing for this item on this data center.
const state = computed(() => {
  if (market.value?.hasData) return 'ready';
  if (!market.value && props.loading) return 'loading';
  return 'empty';
});

const listings = computed(() => market.value?.listings?.slice(0, LISTINGS_SHOWN) ?? []);

// What selling the item's full quantity would bring in at the cheapest listing
// currently on the board. Nothing to sell against means no estimate.
const cheapest = computed(() => cheapestListing(market.value));
const expectedProfit = computed(() => profitOf(props.item));

const facts = computed(() => [
  { label: 'Min', value: formatPrice(market.value?.prices.min), unit: 'gil' },
  { label: 'Average', value: formatPrice(market.value?.prices.currentAverage), unit: 'gil' },
  { label: 'Listings', value: formatNumber(market.value?.listingsCount) },
  { label: 'For sale', value: formatNumber(market.value?.unitsForSale) },
]);
</script>

<template>
  <article class="card" :class="state">
    <header class="card-head">
      <span class="rank">{{ formatRank(item.rank) }}</span>
      <h3 class="name">{{ item.name }}</h3>
      <a
        :href="`https://universalis.app/market/${item.id}`"
        target="_blank"
        rel="noopener noreferrer"
        class="external"
        :aria-label="`Open ${item.name} on Universalis`"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </header>

    <p class="velocity">
      <span class="velocity-value">{{ formatVelocity(item.velocity) }}</span>
      <span class="velocity-unit">sold / day</span>
    </p>

    <template v-if="state === 'ready'">
      <dl class="facts">
        <div v-for="fact in facts" :key="fact.label" class="fact">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }} <span v-if="fact.unit" class="unit">{{ fact.unit }}</span></dd>
        </div>
      </dl>

      <div class="profit" :class="{ none: expectedProfit === null }">
        <span class="profit-label">Expected profit</span>
        <span class="profit-value">
          {{ formatPrice(expectedProfit) }} <span class="unit">gil</span>
        </span>
        <span class="profit-note">
          <template v-if="expectedProfit !== null">
            {{ formatNumber(item.quantity) }} × {{ formatPrice(cheapest) }} gil
          </template>
          <template v-else>no listing to price against</template>
        </span>
      </div>

      <footer class="card-foot">
        <div class="foot-row">
          <button
            v-if="listings.length"
            type="button"
            class="listings-toggle"
            :aria-expanded="listingsOpen"
            @click="listingsOpen = !listingsOpen"
          >
            <svg class="chevron" :class="{ open: listingsOpen }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Listings ({{ listings.length }})
          </button>
          <span v-else class="hint">No listings</span>
          <time class="uploaded" :title="formatDate(market.lastUploadTime)">
            {{ formatRelativeTime(market.lastUploadTime) }}
          </time>
        </div>

        <table v-if="listingsOpen" class="listings">
          <thead>
            <tr>
              <th scope="col">Unit</th>
              <th scope="col" class="num">Qty</th>
              <th scope="col" class="num">Total</th>
              <th scope="col" class="num">World</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(listing, i) in listings" :key="listing.listingID || i">
              <td class="strong">{{ formatPrice(listing.pricePerUnit) }}</td>
              <td class="num muted">×{{ listing.quantity }}</td>
              <td class="num">{{ formatPrice(listing.total) }}</td>
              <td class="num muted">{{ listing.worldName }}</td>
            </tr>
          </tbody>
        </table>
      </footer>
    </template>

    <div v-else-if="state === 'loading'" class="skeleton" aria-busy="true" aria-label="Loading prices">
      <span v-for="n in 4" :key="n" class="skeleton-fact">
        <span class="bone label" /><span class="bone value" />
      </span>
    </div>

    <p v-else class="empty-note">No listings on this data center. Universalis has nothing recorded for it.</p>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  background: var(--surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s;
}

.card:hover {
  transform: translateY(-2px);
}

.card.empty {
  border: 2px dashed var(--line);
  box-shadow: none;
  color: var(--muted);
}

.card-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.rank {
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--faint);
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.external {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: -4px -6px 0 0;
  border-radius: 8px;
  color: var(--muted);
  transition: color 0.15s, background-color 0.15s;
}

.external:hover {
  color: var(--ink);
  background: var(--hairline-soft);
}

.velocity {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.velocity-value {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.empty .velocity-value {
  color: var(--faint);
}

.velocity-unit {
  font-size: 13px;
  color: var(--muted);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hairline-soft);
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fact dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.fact dd {
  font-size: 15px;
  font-weight: 700;
}

.unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.profit {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  align-items: baseline;
  padding: 12px 14px;
  background: var(--hot-tint);
  border-radius: 14px;
}

.profit.none {
  background: var(--hairline-soft);
  color: var(--muted);
}

.profit-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--hot);
}

.profit.none .profit-label {
  color: var(--muted);
}

.profit-value {
  grid-row: span 2;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  text-align: right;
}

.profit-note {
  font-size: 12px;
  color: var(--muted);
}

.card-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline-soft);
}

.foot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.listings-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 700;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.listings-toggle:hover {
  background: var(--hairline-soft);
}

.chevron {
  transition: transform 0.15s;
}

.chevron.open {
  transform: rotate(90deg);
}

.hint,
.uploaded {
  font-size: 12px;
  color: var(--faint);
}

.listings {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.listings th {
  padding: 4px 0;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  color: var(--muted);
}

.listings td {
  padding: 6px 0;
  border-top: 1px solid var(--hairline-soft);
}

.num {
  text-align: right;
}

.strong {
  font-weight: 600;
}

.muted {
  color: var(--muted);
}

.skeleton {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  padding-top: 14px;
  border-top: 1px solid var(--hairline-soft);
}

.skeleton-fact {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bone {
  display: block;
  height: 10px;
  border-radius: 4px;
  background: var(--skeleton);
  animation: pulse 1.4s ease-in-out infinite;
}

.bone.label {
  width: 40%;
}

.bone.value {
  width: 65%;
  height: 14px;
}

@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}

.empty-note {
  padding-top: 14px;
  border-top: 1px solid var(--hairline-soft);
  font-size: 13px;
  line-height: 1.5;
}
</style>
