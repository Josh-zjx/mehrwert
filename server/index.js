/**
 * Backend Server
 * 
 * Express server for managing Universalis API data
 */

import express from 'express';
import cron from 'node-cron';
import {
  initializeItems,
  updateItems,
  getItemsNeedingUpdate,
  getAllItems,
  getItemsByClassification,
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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update items based on their classification
 */
async function performScheduledUpdate() {
  console.log(`[Scheduler] Starting scheduled update...`);
  const itemsToUpdate = getItemsNeedingUpdate();

  const totalItems = itemsToUpdate.hot.length + itemsToUpdate.mild.length + itemsToUpdate.cold.length;

  if (totalItems === 0) {
    console.log(`[Scheduler] No items need updating`);
    return;
  }

  console.log(`[Scheduler] Items to update - Hot: ${itemsToUpdate.hot.length}, Mild: ${itemsToUpdate.mild.length}, Cold: ${itemsToUpdate.cold.length}`);

  // Update hot items
  if (itemsToUpdate.hot.length > 0) {
    try {
      await updateItems(itemsToUpdate.hot, WORLD_NAME);
    } catch (error) {
      console.error(`[Scheduler] Error updating hot items:`, error.message);
    }
  }

  // Update mild items
  if (itemsToUpdate.mild.length > 0) {
    try {
      await updateItems(itemsToUpdate.mild, WORLD_NAME);
    } catch (error) {
      console.error(`[Scheduler] Error updating mild items:`, error.message);
    }
  }

  // Update cold items
  if (itemsToUpdate.cold.length > 0) {
    try {
      await updateItems(itemsToUpdate.cold, WORLD_NAME);
    } catch (error) {
      console.error(`[Scheduler] Error updating cold items:`, error.message);
    }
  }

  console.log(`[Scheduler] Scheduled update complete`);
}

// Schedule updates
// Hot items: every minute
cron.schedule('* * * * *', () => {
  const itemsToUpdate = getItemsNeedingUpdate();
  if (itemsToUpdate.hot.length > 0) {
    performScheduledUpdate();
  }
});

// Mild items: every hour
cron.schedule('0 * * * *', () => {
  const itemsToUpdate = getItemsNeedingUpdate();
  if (itemsToUpdate.mild.length > 0) {
    performScheduledUpdate();
  }
});

// Cold items: every day at midnight
cron.schedule('0 0 * * *', () => {
  const itemsToUpdate = getItemsNeedingUpdate();
  if (itemsToUpdate.cold.length > 0) {
    performScheduledUpdate();
  }
});

// Also run continuous check every minute for items that need updating
setInterval(() => {
  performScheduledUpdate();
}, 60000); // Check every minute

// Start server
async function startServer() {
  try {
    console.log(`[Server] Initializing items...`);
    await initializeItems(WORLD_NAME);
    console.log(`[Server] Items initialized`);

    app.listen(PORT, () => {
      console.log(`[Server] Server running on http://localhost:${PORT}`);
      console.log(`[Server] World/DC: ${WORLD_NAME}`);
      console.log(`[Server] API endpoints:`);
      console.log(`[Server]   GET /api/items - Get all items`);
      console.log(`[Server]   GET /api/items/:id - Get item by ID`);
      console.log(`[Server]   GET /api/items/batch/:ids - Get multiple items`);
      console.log(`[Server]   GET /api/stats - Get server statistics`);
      console.log(`[Server]   GET /health - Health check`);
    });
  } catch (error) {
    console.error(`[Server] Failed to start:`, error);
    process.exit(1);
  }
}

startServer();
