<script setup>
import { ref, onMounted, computed } from 'vue';
import { fetchAllItems, fetchStats } from '../services/backendApi.js';

const items = ref([]);
const loading = ref(true);
const error = ref(null);
const stats = ref(null);
const expandedCards = ref({
  hot: true,
  mild: false,
  cold: false,
});

// Track which classifications have been loaded
const loadedClassifications = ref(new Set(['hot'])); // Hot is loaded by default

// Track loading state per classification
const loadingClassifications = ref({
  hot: false,
  mild: false,
  cold: false,
});

// Track expanded listings for each item
const expandedListings = ref({});

const formatPrice = (price) => {
  if (price === 'NA' || price === null || price === undefined || price === 0) return 'N/A';
  if (typeof price === 'string') return price; // Return string values as-is (e.g., "NA")
  return price.toLocaleString('en-US');
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
};

// Organize items by classification and sort by unitsSold
const organizedItems = computed(() => {
  const hot = [];
  const mild = [];
  const cold = [];

  items.value.forEach(item => {
    // Extract saleVelocity from marketData structure
    // Use unitsSold as velocity
    const rawVelocity = item.marketData?.unitsSold;
    // Handle "NA" values - treat as 0 for sorting purposes
    const saleVelocity = (rawVelocity === 'NA' || rawVelocity === null || rawVelocity === undefined) ? 0 : rawVelocity;
    const itemWithVelocity = {
      ...item,
      saleVelocity,
    };

    switch (item.classification) {
      case 'hot':
        hot.push(itemWithVelocity);
        break;
      case 'mild':
        mild.push(itemWithVelocity);
        break;
      case 'cold':
        cold.push(itemWithVelocity);
        break;
    }
  });

  // Sort by unitsSold in decreasing order
  const sortByVelocity = (a, b) => b.saleVelocity - a.saleVelocity;

  return {
    hot: hot.sort(sortByVelocity),
    mild: mild.sort(sortByVelocity),
    cold: cold.sort(sortByVelocity),
  };
});

const toggleCard = async (classification) => {
  const wasExpanded = expandedCards.value[classification];
  expandedCards.value[classification] = !expandedCards.value[classification];
  
  // If expanding and not yet loaded, fetch items for this classification
  if (expandedCards.value[classification] && !loadedClassifications.value.has(classification)) {
    await loadClassificationData(classification);
  }
};

const toggleListings = (itemID) => {
  expandedListings.value[itemID] = !expandedListings.value[itemID];
};

const loadClassificationData = async (classification) => {
  // Skip if already loaded
  if (loadedClassifications.value.has(classification)) {
    return;
  }

  loadingClassifications.value[classification] = true;
  error.value = null;

  try {
    const itemsData = await fetchAllItems(classification);
    
    // Merge new items with existing items (avoid duplicates)
    const existingIds = new Set(items.value.map(item => item.id));
    const newItems = itemsData.filter(item => !existingIds.has(item.id));
    items.value = [...items.value, ...newItems];
    
    loadedClassifications.value.add(classification);
  } catch (err) {
    error.value = err.message || `Failed to load ${classification} items from backend`;
    console.error(`Error loading ${classification} items:`, err);
  } finally {
    loadingClassifications.value[classification] = false;
  }
};

const loadMarketData = async () => {
  loading.value = true;
  error.value = null;

  try {
    // Load stats and hot items immediately (hot card is expanded by default)
    const [hotItemsData, statsData] = await Promise.all([
      fetchAllItems('hot'),
      fetchStats(),
    ]);

    items.value = hotItemsData;
    stats.value = statsData;
    loadedClassifications.value.add('hot');
  } catch (err) {
    error.value = err.message || 'Failed to load market data from backend';
    console.error('Error loading market data:', err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadMarketData();
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

    <div v-if="stats" class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">Total:</span>
        <span class="stat-value">{{ stats.stats.total }}</span>
      </div>
      <div class="stat-item hot">
        <span class="stat-label">Hot:</span>
        <span class="stat-value">{{ stats.stats.hot }}</span>
      </div>
      <div class="stat-item mild">
        <span class="stat-label">Mild:</span>
        <span class="stat-value">{{ stats.stats.mild }}</span>
      </div>
      <div class="stat-item cold">
        <span class="stat-label">Cold:</span>
        <span class="stat-value">{{ stats.stats.cold }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      Error: {{ error }}
    </div>

    <div v-if="loading" class="loading">
      Loading market data from backend...
    </div>

    <div v-else class="items-container">
      <!-- Hot Items Card -->
      <div class="classification-card hot-card">
        <div class="card-header" @click="toggleCard('hot')">
          <div class="card-title">
            <span class="classification-badge hot-badge">Hot</span>
            <span class="card-count">({{ organizedItems.hot.length }} items)</span>
          </div>
          <div class="card-subtitle">Updated every minute • Units Sold ≥ 1000</div>
          <span class="card-toggle">{{ expandedCards.hot ? '▼' : '▶' }}</span>
        </div>
        <div v-if="expandedCards.hot" class="card-content">
          <div v-if="organizedItems.hot.length === 0" class="no-items">
            No hot items found
          </div>
          <div v-else class="items-grid">
            <div
              v-for="item in organizedItems.hot"
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
                  <span class="velocity-label">Units Sold:</span>
                  <span class="velocity-value">
                    {{ item.marketData?.unitsSold === 'NA' || item.marketData?.unitsSold === null || item.marketData?.unitsSold === undefined || !item.marketData?.hasData ? 'N/A' : item.saleVelocity.toFixed(0) }}
                  </span>
                </div>

                <div class="price-section">
                  <div class="price-row">
                    <span class="price-label">Current Avg:</span>
                    <span class="price-value">{{ formatPrice(item.marketData.currentAveragePrice) }} gil</span>
                  </div>
                  <div class="price-row">
                    <span class="price-label">Min:</span>
                    <span class="price-value min-price">{{ formatPrice(item.marketData.minPrice) }} gil</span>
                  </div>
                </div>

                <div class="stats-section">
                  <div class="stat">
                    <span class="stat-label">Listings:</span>
                    <span class="stat-value">{{ item.marketData.listingsCount }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">For Sale:</span>
                    <span class="stat-value">{{ item.marketData.unitsForSale === 'NA' ? 'N/A' : item.marketData.unitsForSale }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Sold:</span>
                    <span class="stat-value">{{ item.marketData.unitsSold === 'NA' ? 'N/A' : item.marketData.unitsSold }}</span>
                  </div>
                </div>

                <div v-if="item.marketData.listings && item.marketData.listings.length > 0" class="listings-section">
                  <div class="listings-header" @click="toggleListings(item.id)">
                    <span>Listings ({{ item.marketData.listings.length }})</span>
                    <span class="listings-toggle">{{ expandedListings[item.id] ? '▼' : '▶' }}</span>
                  </div>
                  <div v-if="expandedListings[item.id]" class="listings-content">
                    <div
                      v-for="(listing, index) in item.marketData.listings.slice(0, 5)"
                      :key="listing.listingID || index"
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
                  <span class="update-label">Last Updated:</span>
                  <span class="update-time">{{ formatDate(item.lastUpdate) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mild Items Card -->
      <div class="classification-card mild-card">
        <div class="card-header" @click="toggleCard('mild')">
          <div class="card-title">
            <span class="classification-badge mild-badge">Mild</span>
            <span class="card-count">({{ organizedItems.mild.length }} items)</span>
          </div>
          <div class="card-subtitle">Updated every hour • Units Sold 100-999</div>
          <span class="card-toggle">{{ expandedCards.mild ? '▼' : '▶' }}</span>
        </div>
        <div v-if="expandedCards.mild" class="card-content">
          <div v-if="loadingClassifications.mild" class="loading-items">
            Loading mild items...
          </div>
          <div v-else-if="organizedItems.mild.length === 0" class="no-items">
            No mild items found
          </div>
          <div v-else class="items-grid">
            <div
              v-for="item in organizedItems.mild"
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
                  <span class="velocity-label">Units Sold:</span>
                  <span class="velocity-value">
                    {{ item.marketData?.unitsSold === 'NA' || item.marketData?.unitsSold === null || item.marketData?.unitsSold === undefined || !item.marketData?.hasData ? 'N/A' : item.saleVelocity.toFixed(0) }}
                  </span>
                </div>

                <div class="price-section">
                  <div class="price-row">
                    <span class="price-label">Current Avg:</span>
                    <span class="price-value">{{ formatPrice(item.marketData.currentAveragePrice) }} gil</span>
                  </div>
                  <div class="price-row">
                    <span class="price-label">Min:</span>
                    <span class="price-value min-price">{{ formatPrice(item.marketData.minPrice) }} gil</span>
                  </div>
                </div>

                <div class="stats-section">
                  <div class="stat">
                    <span class="stat-label">Listings:</span>
                    <span class="stat-value">{{ item.marketData.listingsCount }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">For Sale:</span>
                    <span class="stat-value">{{ item.marketData.unitsForSale === 'NA' ? 'N/A' : item.marketData.unitsForSale }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Sold:</span>
                    <span class="stat-value">{{ item.marketData.unitsSold === 'NA' ? 'N/A' : item.marketData.unitsSold }}</span>
                  </div>
                </div>

                <div v-if="item.marketData.listings && item.marketData.listings.length > 0" class="listings-section">
                  <div class="listings-header" @click="toggleListings(item.id)">
                    <span>Listings ({{ item.marketData.listings.length }})</span>
                    <span class="listings-toggle">{{ expandedListings[item.id] ? '▼' : '▶' }}</span>
                  </div>
                  <div v-if="expandedListings[item.id]" class="listings-content">
                    <div
                      v-for="(listing, index) in item.marketData.listings.slice(0, 5)"
                      :key="listing.listingID || index"
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
                  <span class="update-label">Last Updated:</span>
                  <span class="update-time">{{ formatDate(item.lastUpdate) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cold Items Card -->
      <div class="classification-card cold-card">
        <div class="card-header" @click="toggleCard('cold')">
          <div class="card-title">
            <span class="classification-badge cold-badge">Cold</span>
            <span class="card-count">({{ organizedItems.cold.length }} items)</span>
          </div>
          <div class="card-subtitle">Updated daily • Units Sold &lt; 100</div>
          <span class="card-toggle">{{ expandedCards.cold ? '▼' : '▶' }}</span>
        </div>
        <div v-if="expandedCards.cold" class="card-content">
          <div v-if="loadingClassifications.cold" class="loading-items">
            Loading cold items...
          </div>
          <div v-else-if="organizedItems.cold.length === 0" class="no-items">
            No cold items found
          </div>
          <div v-else class="items-grid">
            <div
              v-for="item in organizedItems.cold"
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
                  <span class="velocity-label">Units Sold:</span>
                  <span class="velocity-value">
                    {{ item.marketData?.unitsSold === 'NA' || item.marketData?.unitsSold === null || item.marketData?.unitsSold === undefined || !item.marketData?.hasData ? 'N/A' : item.saleVelocity.toFixed(0) }}
                  </span>
                </div>

                <div class="price-section">
                  <div class="price-row">
                    <span class="price-label">Current Avg:</span>
                    <span class="price-value">{{ formatPrice(item.marketData.currentAveragePrice) }} gil</span>
                  </div>
                  <div class="price-row">
                    <span class="price-label">Min:</span>
                    <span class="price-value min-price">{{ formatPrice(item.marketData.minPrice) }} gil</span>
                  </div>
                </div>

                <div class="stats-section">
                  <div class="stat">
                    <span class="stat-label">Listings:</span>
                    <span class="stat-value">{{ item.marketData.listingsCount }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">For Sale:</span>
                    <span class="stat-value">{{ item.marketData.unitsForSale === 'NA' ? 'N/A' : item.marketData.unitsForSale }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Sold:</span>
                    <span class="stat-value">{{ item.marketData.unitsSold === 'NA' ? 'N/A' : item.marketData.unitsSold }}</span>
                  </div>
                </div>

                <div v-if="item.marketData.listings && item.marketData.listings.length > 0" class="listings-section">
                  <div class="listings-header" @click="toggleListings(item.id)">
                    <span>Listings ({{ item.marketData.listings.length }})</span>
                    <span class="listings-toggle">{{ expandedListings[item.id] ? '▼' : '▶' }}</span>
                  </div>
                  <div v-if="expandedListings[item.id]" class="listings-content">
                    <div
                      v-for="(listing, index) in item.marketData.listings.slice(0, 5)"
                      :key="listing.listingID || index"
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
                  <span class="update-label">Last Updated:</span>
                  <span class="update-time">{{ formatDate(item.lastUpdate) }}</span>
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
