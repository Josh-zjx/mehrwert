# Backend Server

Maintains the **classification index**: how actively each item is trading, on every
data center Universalis supports. That is the server's entire job.

It does **not** cache market data. Clients fetch listings and prices straight from
Universalis, which serves `access-control-allow-origin: *`. The server only tells
them which items are worth fetching and how to group them.

It also serves the built frontend. When `dist/index.html` exists (after
`npm run build`), the server hosts it on the same port as the API: `/api/*` and
`/health` are matched first, hashed files under `/assets/` are served with a
one-year cache, and every other `GET` falls back to `index.html`. Without a build
it serves the API only and says so at startup.

## Why it works this way

The original design cached market data for all ~800 items and used three update
tiers (hot/minute, mild/hour, cold/day) to keep the popular ones fresh. Those tiers
only existed because a full sweep takes minutes, so the cache could never be
uniformly current.

Once the client fetches its own display data, that problem disappears - it only ever
requests the items currently on screen. What remains is classification, and
Sale velocity is a trailing multi-day figure that does not need minute-level
freshness. Three tiers collapse into one slow rotating sweep.

This also means the data the user sees is live, rather than up to an hour stale.

## Endpoints

### GET /api/data-centers

Every data center Universalis supports, grouped by region, with how much of each is
indexed so far. The frontend builds its region -> data center picker from this, so
new data centers appear without a code change.

```json
{
  "defaultDataCenter": "Aether",
  "dataCenters": [
    { "name": "Aether", "region": "North-America", "worldCount": 8,
      "indexed": 800, "active": true, "updatedAt": 1789602672039 }
  ]
}
```

`active` is false when every indexed velocity is zero - a data center with no market
activity, such as `NA Cloud DC (Beta)`. The frontend hides those rather than
offering a selection that renders an empty page.

### GET /api/index?dc=&lt;data center&gt;

The classification index for one data center. Item names and metadata are **not**
included - the frontend already bundles `src/assets/itemlist.json`.

Requesting a data center that has not been swept yet returns an empty index and
moves it to the front of the sweep queue, so a first visit costs one sweep rather
than a full rotation. Unknown data centers return 404.

```json
{
  "dataCenter": "猫小胖",
  "updatedAt": 1789602672039,
  "sweeping": false,
  "sweepStartedAt": null,
  "total": 807,
  "indexed": 800,
  "hotLimit": 50,
  "mildThreshold": 14,
  "velocities": { "43983": 184.77, "44041": 571.08 }
}
```

`velocities` are **units sold per day** at the queried data center. `hotLimit` and
`mildThreshold` are the single source of truth for classification; the client
derives both the grouping and the card labels from them:

- rank by velocity, top `hotLimit` (with velocity > 0) → hot
- otherwise `velocity >= mildThreshold` → mild
- otherwise → cold

Hot is a **rank, not a threshold**. A threshold leaves the hot set unbounded, which
floods the UI and makes the client's first fetch unpredictable; a rank keeps it to
exactly one request. Items missing from `velocities` have not been swept yet and
sort to the bottom, so they land in cold.

### GET /health

```json
{ "status": "ok", "timestamp": "2026-09-16T23:51:24.002Z", "defaultDataCenter": "Aether" }
```

## The sweep

One data center at a time, in rotation. For each, one pass over every unique item
ID, 100 per request against `/api/v2/aggregated/{dc}/{ids}`, rate limited by
`universalisClient.js`. Entries update as each batch lands, so the index is usable
while a sweep is still running. Sweeps never overlap.

Per data center that is **9 requests and about 25-70 seconds** (measured mean ~45s;
Universalis' latency varies a lot). Across all 18 data centers a full rotation is
~160 requests and roughly **13 minutes**, after which the server idles for
`SWEEP_INTERVAL_MS`.

Order is oldest-data-first, so a newly added data center is picked up promptly. A
data center a client actually asked for jumps the queue - see `/api/index` above.

### Why the aggregated endpoint

The docs mark `/aggregated` "strongly preferred over CurrentlyShown if individual
sales/listings are not required", which is exactly this case - the index only needs
a velocity number. It is served from cache and takes no history parameters, so it
sidesteps the cost that makes CurrentlyShown time out. Measured at DC scope, 100
items:

| Endpoint | Result |
|---|---|
| CurrentlyShown, `entries=20` | 504 past ~10 items |
| aggregated | 200 in ~2-4s |

Velocity is read from `nq.dailySaleVelocity.dc.quantity + hq...`. NQ and HQ are
summed so an item traded mainly as HQ is not treated as dead. The **`dc`** figure is
used deliberately, never `region`: players cannot trade across data centers, so
region-wide volume is not reachable.

### Scope matters more than batch size

Universalis sits behind a gateway that times out at about 11 seconds, and query cost
scales with the number of worlds in scope. Measured with the same 5 items:

| Scope | Worlds | Result |
|---|---|---|
| `红玉海` (world) | 1 | 200 in 2.0s |
| `猫小胖` (DC) | 8 | 200 in 6.5s |
| `Aether` (DC) | 8 | 200 in 8.5s |
| `中国` / `China` (region) | 36 | **504** |
| `North-America` (region) | 32 | **504** |

**Everything here is scoped to a data center, never a region.** Two reasons:

1. Players cannot trade across data centers, so a region-wide price is not
   actionable.
2. Region queries fail anyway. `China` is a region alias spanning 4 data centers and
   36 worlds; `North-America` spans 32. Both 504 every time.

The data center list is read from Universalis' own `/data-centers` endpoint at
startup, so the game's topology is never hardcoded. A bundled snapshot is used only
if Universalis is unreachable at boot.

### Persistence and failures

The index is persisted to `data/index.json` after each sweep and reloaded at
startup, so a restart serves data immediately.

Transient failures (504, 429, network) are retried once. A batch that still fails is
logged and skipped - those items keep their previous value and are picked up by the
next sweep.

## Environment Variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DEFAULT_DATA_CENTER` | `Aether` | Offered to clients with no data center in the URL |
| `SWEEP_INTERVAL_MS` | `900000` | Idle time after a full rotation (15 min) |
| `HOT_LIMIT` | `50` | How many items rank as hot |
| `MILD_THRESHOLD` | `14` | Units/day at or above which an item is mild |
| `DATA_DIR` | `./data` | Where `index.json` is written |
| `DIST_DIR` | `../dist` (repo root) | Built frontend to serve; API-only if absent |

All 18 data centers are swept regardless of this setting; it only decides where a
client with no bookmark lands. The China data centers are 陆行鸟, 莫古力, 猫小胖 and
豆豆柴.

## Architecture

- `server/index.js` - Express setup, the two endpoints, starts the sweep
- `server/services/dataCenters.js` - which data centers exist, read from Universalis
- `server/services/itemIndex.js` - the per-DC index, the sweep, persistence, retries
- `server/services/universalisClient.js` - rate-limited Universalis client
- `server/utils/common.js` - shared helpers

## Tests

```bash
npm test
```

`server/services/itemIndex.test.js` covers the sweep against a stubbed Universalis
client: batching, NQ+HQ velocity summing, DC-vs-region scoping, retry behaviour,
per-data-center isolation, coverage reporting, and that a failed sweep preserves
previously known values.
