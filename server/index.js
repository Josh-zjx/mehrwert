/**
 * Backend Server
 *
 * Serves the per-data-center classification index. Market data itself is fetched by
 * the client directly from Universalis - see server/README.md for the rationale.
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiError } from './utils/common.js';
import { loadIndex, startSweeping, getIndex, getCoverage, requestDataCenter } from './services/itemIndex.js';
import { loadDataCenters, getDataCenters, isKnownDataCenter } from './services/dataCenters.js';

const app = express();
const PORT = process.env.PORT || 3000;
// Offered to clients that arrive without a data center in the URL. Must be a data
// center, never a region: players cannot trade across data centers, and region
// queries span 30+ worlds and exceed Universalis' ~11s gateway timeout.
const DEFAULT_DATA_CENTER = process.env.DEFAULT_DATA_CENTER || 'Aether';
// Idle time after a full rotation over every data center. Sale velocity is a
// trailing multi-day figure, so there is nothing to gain from sweeping faster.
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS) || 15 * 60 * 1000;
// Built frontend (`npm run build`). When present it is served from the same port as
// the API so the whole app is a single process. Absent, only the API is served.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = process.env.DIST_DIR || join(__dirname, '../dist');
const SERVE_FRONTEND = existsSync(join(DIST_DIR, 'index.html'));

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    defaultDataCenter: DEFAULT_DATA_CENTER,
  });
});

/**
 * GET /api/data-centers
 * Every data center Universalis supports, grouped by region, with how much of each
 * is indexed so far. The frontend builds its region -> data center picker from this.
 */
app.get('/api/data-centers', (req, res) => {
  try {
    const coverage = getCoverage();

    res.json({
      defaultDataCenter: DEFAULT_DATA_CENTER,
      dataCenters: getDataCenters().map(dc => ({
        ...dc,
        ...coverage[dc.name],
      })),
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

/**
 * GET /api/index?dc=<data center>
 * The classification index for one data center: itemID -> units sold per day, plus
 * the policy used to group items. Item names come from the client's itemlist.json.
 */
app.get('/api/index', (req, res) => {
  try {
    const dataCenter = req.query.dc || DEFAULT_DATA_CENTER;

    if (!isKnownDataCenter(dataCenter)) {
      return res.status(404).json({
        success: false,
        error: `Unknown data center: ${dataCenter}`,
      });
    }

    // Lets the sweep jump to a data center someone is actually waiting on
    requestDataCenter(dataCenter);

    res.json(getIndex(dataCenter));
  } catch (error) {
    handleApiError(res, error);
  }
});

// Unknown API paths get a JSON 404 rather than falling through to the SPA page
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Not found: ${req.originalUrl}`,
  });
});

if (SERVE_FRONTEND) {
  // Vite emits content-hashed filenames under assets/, so those are safe to cache
  // for a long time. index.html keeps the default (no explicit max-age) so a new
  // build is picked up on the next load.
  app.use('/assets', express.static(join(DIST_DIR, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(DIST_DIR));

  // SPA fallback: anything that is not an API route or a static file gets the app
  app.get('*', (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

async function startServer() {
  loadIndex();

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] Default data center: ${DEFAULT_DATA_CENTER}`);
    console.log(`[Server] Sweep interval: ${SWEEP_INTERVAL_MS / 1000}s`);
    console.log(`[Server]   GET /api/data-centers - Regions and data centers`);
    console.log(`[Server]   GET /api/index?dc=... - Classification index`);
    console.log(`[Server]   GET /health           - Health check`);
    if (SERVE_FRONTEND) {
      console.log(`[Server] Serving frontend from ${DIST_DIR}`);
    } else {
      console.log(`[Server] No frontend build found at ${DIST_DIR} - serving API only (run \`npm run build\` to serve the app from this port)`);
    }
  });

  // Needs the data center list before it can sweep anything
  await loadDataCenters();
  startSweeping(SWEEP_INTERVAL_MS);
}

startServer();
