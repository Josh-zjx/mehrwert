# Mehrwert

A web application for displaying Final Fantasy XIV (FFXIV) item market data from the Universalis API. The app features a backend server that intelligently manages and updates market data, and a Vue.js frontend that displays items organized by their trading activity.

This codebase is ***completely*** generated using ***Vibe Coding*** with Cursor CLI.

## Features

- **Intelligent Item Classification**: Items are automatically classified based on sale velocity:
  - **Hot**: saleVelocity ≥ 1000 (updated every minute)
  - **Mild**: saleVelocity < 1000 (updated every hour)
  - **Cold**: saleVelocity < 100 (updated once per day)

- **Organized Display**: Items are displayed in collapsible cards grouped by classification, sorted by sale velocity

- **Market Listings**: View up to 5 current market listings per item with expandable details

- **Direct Links**: Quick access to Universalis market pages for each item

- **Real-time Updates**: Backend automatically fetches and updates market data based on item activity

## Architecture

The application consists of two main components:

1. **Backend Server** (Node.js/Express): Manages data fetching from Universalis API, classifies items, and provides a RESTful API
2. **Frontend Web App** (Vue.js): Displays market data in an organized, user-friendly interface

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

### Step 1: Start the Backend Server

The backend server fetches and manages market data from the Universalis API. It needs to be running before the frontend can display data.

**Production mode:**
```bash
npm run server
```

**Development mode (with auto-reload):**
```bash
npm run server:dev
```

The server will start on `http://localhost:3000` by default.

**Note**: On first startup, the server will:
- Load item IDs from `src/assets/itemlist.json`
- Fetch initial market data for all items (this may take a few minutes)
- Begin scheduled updates based on item classification

### Step 2: Start the Frontend Development Server

In a **separate terminal**, start the frontend:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` (or another port if 5173 is busy).

### Step 3: Use the Application

1. Open your browser and navigate to `http://localhost:5173`
2. The app will automatically load market data from the backend server
3. Items are organized into three collapsible sections:
   - **Hot Items**: High-velocity items (expanded by default)
   - **Mild Items**: Medium-velocity items (collapsed by default)
   - **Cold Items**: Low-velocity items (collapsed by default)

## Using the Web App

### Viewing Items

- **Expand/Collapse Categories**: Click on the category header (Hot/Mild/Cold) to expand or collapse that section
- **Sort Order**: Items within each category are sorted by sale velocity (highest first)
- **Item Details**: Each item card shows:
  - Item name with link to Universalis market page
  - Current average price
  - Minimum price
  - Number of units sold
  - Last update timestamp

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

Environment variables (optional):

- `PORT`: Backend server port (default: `3000`)
- `WORLD_NAME`: World/data center name for Universalis API (default: `China`)

Example:
```bash
PORT=3000 WORLD_NAME=China npm run server
```

### Frontend Configuration

The frontend connects to the backend via the `VITE_API_BASE_URL` environment variable.

**Default**: `http://localhost:3000`

To use a different backend URL, create a `.env` file in the project root:

```env
VITE_API_BASE_URL=http://your-backend-url:3000
```

## Building for Production

### Build Frontend

```bash
npm run build
```

This creates a `dist/` directory with the production-ready frontend files.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
mehrwert/
├── src/
│   ├── assets/
│   │   └── itemlist.json          # Item IDs to fetch
│   ├── components/
│   │   └── ItemMarketDisplay.vue   # Main display component
│   ├── services/
│   │   ├── backendApi.js           # Frontend API client
│   │   ├── universalis.js         # Universalis API utilities (legacy)
│   │   └── logger.js               # Logging utilities
│   ├── App.vue                     # Root Vue component
│   └── main.js                     # Application entry point
├── server/
│   ├── index.js                    # Express server entry point
│   ├── routes/
│   │   └── items.js                # Item API routes
│   └── services/
│       ├── universalisClient.js    # Universalis API client
│       └── itemManager.js          # Item data management
├── package.json
└── README.md
```

## API Endpoints

The backend provides the following RESTful API endpoints:

- `GET /health` - Health check
- `GET /api/stats` - Server statistics (item counts by classification)
- `GET /api/items` - Get all items (optional `?classification=hot|mild|cold` filter)
- `GET /api/items/:id` - Get item by ID
- `GET /api/items/batch/:ids` - Get multiple items by comma-separated IDs

For detailed API documentation, see [server/README.md](./server/README.md).

## How It Works

1. **Backend Initialization**:
   - Reads item IDs from `src/assets/itemlist.json`
   - Fetches initial market data from Universalis API
   - Classifies each item based on `regularSaleVelocity`
   - Stores data in memory with update schedules

2. **Scheduled Updates**:
   - Hot items: Updated every minute via cron job
   - Mild items: Updated every hour via cron job
   - Cold items: Updated once per day (midnight) via cron job
   - Continuous check: Every minute, updates any items past their `nextUpdate` time

3. **Frontend Display**:
   - Fetches all items from backend API on page load
   - Groups items by classification
   - Sorts items by sale velocity (descending)
   - Displays in collapsible cards

## Rate Limiting

The backend respects Universalis API limits:
- Maximum 5 item IDs per API call
- 1-1.5 second randomized delay between API calls (base 1s + random 0-500ms)
- Batches large requests automatically

## Troubleshooting

### Frontend shows "Failed to load market data"

- Ensure the backend server is running (`npm run server`)
- Check that the backend URL in `src/services/backendApi.js` matches your backend server URL
- Verify the backend is accessible at the configured port

### Backend takes a long time to start

- This is normal on first startup as it fetches data for all items
- Subsequent startups are faster as items are updated incrementally
- Check server logs for progress updates

### Items not updating

- Hot items update every minute - wait a minute and refresh
- Check server logs for any API errors
- Verify the Universalis API is accessible

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
