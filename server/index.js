/**
 * Backend Server
 * 
 * Express server for managing Universalis API data
 */

import express from 'express';
import { handleApiError } from './utils/common.js';
import {
  initializeItems,
  updateItems,
  getItemsNeedingUpdate,
  getAllItems,
  getItemsByClassification,
  getItem,
  HOT_UPDATE_INTERVAL,
  MILD_UPDATE_INTERVAL,
  COLD_UPDATE_INTERVAL,
} from './services/itemManager.js';
import itemsRouter from './routes/items.js';

const app = express();
const PORT = process.env.PORT || 3000;
const WORLD_NAME = process.env.WORLD_NAME || 'China';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes
app.use('/api/items', itemsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    worldName: WORLD_NAME,
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const allItems = getAllItems();
    const hotItems = getItemsByClassification('hot');
    const mildItems = getItemsByClassification('mild');
    const coldItems = getItemsByClassification('cold');

    res.json({
      success: true,
      stats: {
        total: allItems.length,
        hot: hotItems.length,
        mild: mildItems.length,
        cold: coldItems.length,
      },
      updateIntervals: {
        hot: `${HOT_UPDATE_INTERVAL / 1000}s (1 minute)`,
        mild: `${MILD_UPDATE_INTERVAL / 1000 / 60}min (1 hour)`,
        cold: `${COLD_UPDATE_INTERVAL / 1000 / 60 / 60}hr (1 day)`,
      },
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

// Debug endpoint to check store state
app.get('/api/debug/store', (req, res) => {
  try {
    const sampleItemIDs = [32953, 32950, 29978];
    const debugInfo = sampleItemIDs.map(itemID => {
      const item = getItem(itemID);
      return {
        itemID,
        exists: item !== null,
        unitsSold: item?.marketData?.unitsSold,
        unitsSoldType: typeof item?.marketData?.unitsSold,
        hasData: item?.marketData?.hasData,
        classification: item?.classification,
        lastUpdate: item?.lastUpdate,
        nextUpdate: item?.nextUpdate,
        isNA: item?.marketData?.unitsSold === 'NA' || item?.marketData?.unitsSold === null || item?.marketData?.unitsSold === undefined,
      };
    });
    
    res.json({
      success: true,
      debug: debugInfo,
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

/**
 * Update items based on their classification
 */
async function performScheduledUpdate() {
  const itemsToUpdate = getItemsNeedingUpdate();
  const allItems = [...itemsToUpdate.hot, ...itemsToUpdate.mild, ...itemsToUpdate.cold];

  if (allItems.length === 0) {
    return;
  }

  try {
    await updateItems(allItems, WORLD_NAME);
  } catch (error) {
    console.error(`[Scheduler] Error updating items:`, error.message);
  }
}

// Schedule updates - check every minute for items that need updating
setInterval(() => {
  performScheduledUpdate();
}, 60000);

// Start server
function startServer() {
  try {
    // Start the server immediately (no NA initialization)
    app.listen(PORT, () => {
      console.log(`[Server] Server running on http://localhost:${PORT}`);
      console.log(`[Server] World/DC: ${WORLD_NAME}`);
      console.log(`[Server] API endpoints:`);
      console.log(`[Server]   GET /api/items - Get all items`);
      console.log(`[Server]   GET /api/items/:id - Get item by ID`);
      console.log(`[Server]   GET /api/items/batch/:ids - Get multiple items`);
      console.log(`[Server]   GET /api/stats - Get server statistics`);
      console.log(`[Server]   GET /health - Health check`);
      console.log(`[Server] API is now available. Fetching market data in background...`);
    });

    // Start background fetching (non-blocking)
    // This will populate the store as data is fetched
    initializeItems(WORLD_NAME);
  } catch (error) {
    console.error(`[Server] Failed to start:`, error);
    process.exit(1);
  }
}

startServer();
