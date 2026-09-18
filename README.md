# Mehrwert

A web application for displaying Final Fantasy XIV (FFXIV) item market data from the Universalis API. The app features a backend server that intelligently manages and updates market data, and a Vue.js frontend that displays items organized by their trading activity.

This codebase is ***completely*** generated using ***Vibe Coding*** with Cursor CLI.

## Features

- **Live market data**: prices and listings are fetched from Universalis by the
  browser at the moment you look at them, not served from a cache

- **Every data center**: pick your region and data center from the header; the
  choice goes in the URL so you can bookmark your own market

- **Activity classification**: a backend sweep tracks each item's daily sale
  velocity per data center and groups them as Hot / Mild / Cold

- **Bounded hot list**: Hot is the top 50 items by sales per day, so opening the
  page is always a single API request (~2s) no matter how busy the market is

- **Lazy loading**: only the expanded category is fetched, and each batch renders as
  it arrives rather than waiting for the whole category

- **Market listings**: up to 5 current listings per item with expandable details

- **Direct links**: quick access to the Universalis market page for each item

## Architecture

Two components, with a deliberately thin line between them:

1. **Backend Server** (Node.js/Express) - sweeps Universalis to maintain a small
   index of `itemID -> units sold per day`, one per data center, and serves it at
   `GET /api/index?dc=...`. It stores no market data.
2. **Frontend Web App** (Vue.js) - reads the index to decide what is hot, then
   fetches prices and listings for the visible category straight from Universalis.

Universalis serves `access-control-allow-origin: *`, so the browser calls it
directly and the backend stays out of the data path. See
[server/README.md](./server/README.md) for why this beats caching everything.

## Prerequisites

- Node.js (^20.19.0 || >=22.12.0)
- npm

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mehrwert
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Production: one process, one port

The Express server serves the built frontend alongside the API, so a deployment is
a single Node process on a single port:

```bash
npm run build      # writes the frontend to dist/
npm run server     # serves dist/ and the API on http://localhost:3000
```

`npm start` does both in one step. Open `http://localhost:3000` in your browser.

The server looks for `dist/index.html` at startup. If it is missing, it logs a
notice and serves only the API (useful during development, below).

### Development: hot reload

The backend maintains the activity index the frontend uses to decide what is hot. It needs to be running before the frontend can group items.

#### Step 1: Start the Backend Server

**Production mode:**
```bash
npm run server
```

**Development mode (with auto-reload):**
```bash
npm run server:dev
```

The server will start on `http://localhost:3000` by default.

**Note**: On first startup the server loads item IDs from
`src/assets/itemlist.json` and sweeps Universalis for sale velocities. A full sweep
is 9 requests and takes about 25 seconds. The API is available immediately and
serves whatever has been indexed so far. Subsequent starts reload `data/index.json`
and serve the previous results instantly.

#### Step 2: Start the Frontend Development Server

In a **separate terminal**, start the frontend:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` (or another port if 5173 is busy).
The dev server proxies `/api` and `/health` to the backend on port 3000, so the app
talks to the API on its own origin exactly as it does in production. If your backend
runs elsewhere, set `BACKEND_URL` when starting Vite:

```bash
BACKEND_URL=http://localhost:4000 npm run dev
```

#### Step 3: Use the Application

1. Open your browser and navigate to `http://localhost:5173`
2. Pick your **region** and **data center** in the header. The app loads that data
   center's activity index, then fetches live prices for the Hot category from
   Universalis. Your choice is written to the URL, so you can bookmark it
3. Items are organized into three collapsible sections, by units sold per day on
   the selected data center:
   - **Hot**: the top 50 items by velocity (expanded by default)
   - **Mild**: >= 14 sold/day (collapsed by default)
   - **Cold**: everything else (collapsed by default)

Expanding Mild or Cold fetches their prices on demand, with a progress indicator,
rendering each batch as it lands. Cold contains most of the list, so it takes the
longest.

## Using the Web App

### Viewing Items

- **Expand/Collapse Categories**: Click on the category header (Hot/Mild/Cold) to expand or collapse that section
- **Sort Order**: Items within each category are sorted by sales per day (highest first)
- **Refresh**: re-reads the index and re-fetches prices for whatever is expanded
- **Item Details**: Each item card shows:
  - Item name with link to Universalis market page
  - Current average price
  - Minimum price
  - Units sold per day and units for sale
  - When the data was last uploaded to Universalis

### Viewing Listings

- Click on the "Listings" header for any item to expand/collapse the listings section
- Each listing shows:
  - Price per unit
  - Quantity available
  - Total price
  - World name

### External Links

- Click the 🔗 icon next to an item name to open its Universalis market page in a new tab

## Configuration

### Backend Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Backend server port |
| `DEFAULT_DATA_CENTER` | `Aether` | Where clients with no bookmark land |
| `SWEEP_INTERVAL_MS` | `900000` | Idle time after a full rotation (15 min) |
| `HOT_LIMIT` | `50` | How many items rank as Hot |
| `MILD_THRESHOLD` | `14` | Units/day at or above which an item is Mild |
| `DATA_DIR` | `./data` | Where the persisted index is written |
| `DIST_DIR` | `./dist` | Built frontend to serve; API-only if absent |

```bash
PORT=3000 DEFAULT_DATA_CENTER=猫小胖 npm run server
```

All data centers Universalis supports are swept regardless of this setting - it only
decides where a visitor with no bookmark lands. The list comes from Universalis
itself, so new data centers appear without a code change.

### Frontend Configuration

By default the frontend calls the API with relative URLs (`/api/...`), which works
when the Express server serves the built app and in development through Vite's
proxy. No configuration is needed for the single-port setup.

If you host the frontend separately from the API (for example as static files on a
CDN), set `VITE_API_BASE_URL` when building. It is inlined at build time, so it has
to be present when `npm run build` runs, for instance via a `.env` file:

```env
VITE_API_BASE_URL=https://your-backend-host
```

The server sends `Access-Control-Allow-Origin: *`, so cross-origin calls from such
a deployment are allowed.

Which market you are looking at is chosen in the UI, not by configuration, and is
stored in the URL:

```
http://localhost:3000/?region=North-America&dc=Aether
http://localhost:3000/?region=%E4%B8%AD%E5%9B%BD&dc=%E7%8C%AB%E5%B0%8F%E8%83%96
```

Bookmark that link and you land on your own data center. `?dc=` alone is enough -
the region is inferred from it. An unknown data center falls back to the server
default rather than erroring.

## Building for Production

### Build Frontend

```bash
npm run build
```

This creates a `dist/` directory with the production-ready frontend files. The
Express server picks it up automatically on its next start (see
[Running the Application](#running-the-application)), so there is nothing to copy
or configure.

### Preview Production Build

The easiest way to check a production build is to run the real server against it:

```bash
npm start
```

`npm run preview` also works for inspecting the static files, but Vite's preview
server has no API proxy, so the app will not be able to load the item index there.

## Project Structure

```
mehrwert/
├── src/
│   ├── assets/
│   │   └── itemlist.json           # Item IDs and names, bundled into the app
│   ├── components/
│   │   └── ItemMarketDisplay.vue   # Main display component
│   ├── services/
│   │   ├── backendApi.js           # Reads the classification index
│   │   ├── itemMarketService.js    # Fetches market data from Universalis
│   │   ├── universalis.js          # Universalis API client
│   │   └── logger.js               # Logging utilities
│   ├── App.vue
│   └── main.js
├── server/
│   ├── index.js                    # Express server, /api/index and /health
│   └── services/
│       ├── dataCenters.js          # Which data centers exist (from Universalis)
│       ├── itemIndex.js            # The per-DC index, the sweep, persistence
│       └── universalisClient.js    # Rate-limited Universalis client
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/data-centers` - regions, data centers and indexing coverage
- `GET /api/index?dc=<name>` - classification index (`itemID -> units sold per day`) plus policy
- `GET /health` - health check

That is the whole backend API. Market data is not proxied through it.

For details, see [server/README.md](./server/README.md).

## How It Works

1. **Backend sweep**: reads the item IDs from `src/assets/itemlist.json` and, for
   one data center at a time, walks them 100 at a time against Universalis' cached
   `/aggregated` endpoint, recording each item's daily sale velocity. The index is
   written to `data/index.json` and reloaded on restart. Each data center is 9
   requests and ~25-70s; a full rotation over all 18 takes about 13 minutes, after
   which the server idles for `SWEEP_INTERVAL_MS`. A data center a client actually
   asked for jumps the queue.

2. **Frontend load**: fetches `/api/data-centers` to build the picker, then
   `/api/index?dc=...`, ranks every item from the bundled item list by velocity, and
   groups them using the policy the backend supplied.

3. **On demand**: expanding a category fetches market data for just that category's
   items directly from Universalis, in batches of 100, rendering each batch as it
   lands. Collapsed categories cost nothing.

## Troubleshooting

### Frontend shows "Failed to load the item index from the backend"

- Ensure the backend is running (`npm run server`)
- Single-port setup: make sure `dist/` is a fresh build (`npm run build`) and that
  the server logged `Serving frontend from ...` at startup
- Separate frontend host: check `VITE_API_BASE_URL` was set when the frontend was
  built and matches the backend's address

### Categories show items but prices say "No market data available"

The browser could not reach Universalis, or Universalis returned nothing for those
items. Check the browser console. Universalis is periodically slow enough to time
out - see below.

### Everything is classified Cold / counts look wrong

The first sweep takes about 25 seconds. Until it finishes, unswept items sort to the
bottom and land in Cold. `GET /api/index` reports `indexed` vs `total` so you can
watch progress.

### A data center says "not been indexed yet"

Requesting it moves it to the front of the sweep queue; give it up to a minute and
refresh. Until the first full rotation completes (~13 minutes from a cold start),
data centers later in the rotation will be empty.

### Backend logs "batch failed ... 504 Gateway Timeout"

Occasional failures are normal; those batches keep their previous values and are
retried on the next sweep. Sustained failures for every data center usually mean
Universalis itself is degraded.

Note that region-scoped queries (`China`, `North-America`, ...) always fail - they
span 30+ worlds and exceed Universalis' ~11 s gateway timeout. This app never issues
them, but it is the first thing to check if you add a query of your own.

## Testing

```bash
npm test
```

Covers the Universalis client, the backend sweep (against a stubbed API), and the
display component.

## Development

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (disable Vetur)

### Recommended Browser Setup

- **Chromium-based browsers** (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
- **Firefox**:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)


## Acknowledgments

- [Universalis API](https://universalis.app/) for providing FFXIV market data
- [Vue.js](https://vuejs.org/) for the frontend framework
- [Express.js](https://expressjs.com/) for the backend framework
