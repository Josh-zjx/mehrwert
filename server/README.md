# Backend Server

Backend server for managing Universalis API data with intelligent update scheduling.

## Features

- **Item Classification**: Automatically classifies items based on sale velocity:
  - **Cold**: saleVelocity < 100 (updated once per day)
  - **Mild**: saleVelocity < 1000 (updated once per hour)
  - **Hot**: saleVelocity >= 1000 (updated once per minute)

- **Intelligent Updates**: Items are updated based on their classification to optimize API usage

- **Rate Limiting**: 
  - Maximum 5 item IDs per API call
  - 1-1.5 second randomized delay between API calls (base 1s + random 0-500ms)

- **RESTful API**: Provides endpoints to query item data

## Installation

Dependencies are already installed. If needed:

```bash
npm install
```

## Running the Server

```bash
# Production mode
npm run server

# Development mode with auto-reload
npm run server:dev
```

The server will start on `http://localhost:3000` by default.

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "worldName": "China"
}
```

### GET /api/stats
Get server statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 833,
    "hot": 50,
    "mild": 200,
    "cold": 583
  },
  "updateIntervals": {
    "hot": "60s (1 minute)",
    "mild": "60min (1 hour)",
    "cold": "24hr (1 day)"
  }
}
```

### GET /api/items
Get all items.

**Query Parameters:**
- `classification` (optional): Filter by 'hot', 'mild', or 'cold'

**Example:**
```
GET /api/items
GET /api/items?classification=hot
```

**Response:**
```json
{
  "success": true,
  "count": 833,
  "items": [...]
}
```

### GET /api/items/:id
Get item by ID.

**Example:**
```
GET /api/items/32833
```

**Response:**
```json
{
  "success": true,
  "item": {
    "id": 32833,
    "name": "西兰花",
    "marketData": {...},
    "classification": "hot",
    "lastUpdate": 1705312245123,
    "nextUpdate": 1705312305123
  }
}
```

### GET /api/items/batch/:ids
Get multiple items by IDs (comma-separated).

**Example:**
```
GET /api/items/batch/32833,32834,32835
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "requested": 3,
  "items": [...]
}
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `WORLD_NAME`: World/data center name (default: 'China')

## Architecture

- **server/index.js**: Main server file with Express setup and scheduling
- **server/services/universalisClient.js**: Universalis API client with rate limiting
- **server/services/itemManager.js**: Item data management and classification
- **server/routes/items.js**: RESTful API routes

## Update Schedule

- **Hot items**: Updated every minute
- **Mild items**: Updated every hour
- **Cold items**: Updated once per day (at midnight)

The server also performs a continuous check every minute to update any items that have passed their `nextUpdate` timestamp.
