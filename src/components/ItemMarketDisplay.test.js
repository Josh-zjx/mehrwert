import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchIndex = vi.fn();
const fetchDataCenters = vi.fn();
const fetchMarketDataForIds = vi.fn();

vi.mock('../services/backendApi.js', () => ({
  fetchIndex: (...args) => fetchIndex(...args),
  fetchDataCenters: (...args) => fetchDataCenters(...args),
}));

vi.mock('../services/itemMarketService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMarketDataForIds: (...args) => fetchMarketDataForIds(...args),
}));

// Two real ids from the bundled item list
const HOT_ID = 43983;
const MILD_ID = 44041;

const CATALOG = {
  defaultDataCenter: 'Aether',
  dataCenters: [
    { name: 'Aether', region: 'North-America', worldCount: 8, indexed: 807, active: true },
    { name: 'Crystal', region: 'North-America', worldCount: 8, indexed: 807, active: true },
    { name: '猫小胖', region: '中国', worldCount: 7, indexed: 807, active: true },
    // Beta data centers return rows but no sales, and should not be offered
    { name: 'NA Cloud DC (Beta)', region: 'NA-Cloud-DC', worldCount: 2, indexed: 807, active: false },
  ],
};

function marketDataFor(id) {
  return {
    itemID: id,
    hasData: true,
    listings: [{ pricePerUnit: 120, quantity: 99, total: 11880, worldName: 'Gilgamesh' }],
    listingsCount: 1,
    unitsForSale: 99,
    unitsSold: 0, // entries=0, so history is not requested
    prices: { currentAverage: 130, min: 120, max: 140 },
    saleVelocity: { regular: 5 },
    lastUploadTime: 1700000000000,
  };
}

function indexFor(dataCenter) {
  return {
    dataCenter,
    updatedAt: 1700000000000,
    sweeping: false,
    total: 807,
    indexed: 2,
    hotLimit: 1,
    mildThreshold: 14,
    velocities: { [HOT_ID]: 1500, [MILD_ID]: 400 },
  };
}

/**
 * Mount the component and let its onMounted fetch chain settle
 */
async function mount() {
  const { createApp, nextTick } = await import('vue');
  const { default: ItemMarketDisplay } = await import('./ItemMarketDisplay.vue');

  const el = document.createElement('div');
  const app = createApp(ItemMarketDisplay);
  app.mount(el);

  for (let i = 0; i < 30; i++) {
    await nextTick();
    await Promise.resolve();
  }

  return { el, app };
}

/**
 * Set the page URL before mounting, as a bookmarked link would
 */
function setUrl(search) {
  window.history.replaceState({}, '', `/${search}`);
}

beforeEach(() => {
  vi.resetModules();
  fetchIndex.mockReset();
  fetchDataCenters.mockReset();
  fetchMarketDataForIds.mockReset();
  setUrl('');

  fetchDataCenters.mockResolvedValue(CATALOG);
  fetchIndex.mockImplementation(async (dc) => indexFor(dc));
  fetchMarketDataForIds.mockImplementation(async (ids, opts) => {
    const items = Object.fromEntries(ids.map(id => [String(id), marketDataFor(id)]));
    opts?.onBatch?.(items); // the component renders from onBatch, not the return value
    return items;
  });
});

describe('ItemMarketDisplay', () => {
  it('surfaces a backend failure instead of rendering an empty page', async () => {
    fetchDataCenters.mockRejectedValue(new Error('Backend API error: 500 Internal Server Error'));

    const { el, app } = await mount();

    expect(el.innerHTML).toContain('Backend API error: 500');
    expect(fetchMarketDataForIds).not.toHaveBeenCalled();
    app.unmount();
  });

  it('groups items by the policy the backend sends and renders market data', async () => {
    const { el, app } = await mount();
    const html = el.innerHTML;

    // Card labels are derived from the policy the backend sent
    expect(html).toContain('Top 1 by daily sales');
    expect(html).toContain('≥ 14 sold/day');
    expect(html).toContain('&lt; 14 sold/day');

    expect(html).toContain('西兰花'); // item name comes from the bundled list
    expect(html).toContain('1,500'); // velocity from the index, not from market data
    expect(html).toContain('120 gil');

    // Listings stay collapsed until the user opens them
    expect(html).toContain('Listings (1)');
    expect(html).not.toContain('Gilgamesh');

    // Only the hot card was fetched; mild/cold stay collapsed and unfetched
    expect(fetchMarketDataForIds).toHaveBeenCalledTimes(1);
    expect(fetchMarketDataForIds.mock.calls[0][0]).toEqual([HOT_ID]);
    app.unmount();
  });

  it('defaults to the backend default data center and puts it in the URL', async () => {
    const { app } = await mount();

    expect(fetchIndex).toHaveBeenCalledWith('Aether');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('region')).toBe('North-America');
    expect(params.get('dc')).toBe('Aether');
    app.unmount();
  });

  it('honours a bookmarked region and data center from the URL', async () => {
    setUrl('?region=%E4%B8%AD%E5%9B%BD&dc=%E7%8C%AB%E5%B0%8F%E8%83%96');

    const { el, app } = await mount();

    expect(fetchIndex).toHaveBeenCalledWith('猫小胖');
    // Market data is fetched for the bookmarked data center, not the default
    expect(fetchMarketDataForIds.mock.calls[0][1].worldName).toBe('猫小胖');
    expect(el.innerHTML).toContain('猫小胖');
    app.unmount();
  });

  it('falls back to the default when the URL names an unknown data center', async () => {
    setUrl('?region=Atlantis&dc=Nowhere');

    const { app } = await mount();

    expect(fetchIndex).toHaveBeenCalledWith('Aether');
    expect(new URLSearchParams(window.location.search).get('dc')).toBe('Aether');
    app.unmount();
  });

  it('resolves the region from the data center alone', async () => {
    // A bookmark with only ?dc= should still place the region correctly
    setUrl('?dc=Crystal');

    const { app } = await mount();

    expect(fetchIndex).toHaveBeenCalledWith('Crystal');
    expect(new URLSearchParams(window.location.search).get('region')).toBe('North-America');
    app.unmount();
  });

  it('hides data centers that have no recorded sales', async () => {
    const { el, app } = await mount();

    expect(el.innerHTML).not.toContain('NA Cloud DC (Beta)');
    app.unmount();
  });
});
