import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMarketData,
  parseItemData,
  getItemMarketData,
  getCheapestListing,
  getMostRecentSale,
  getTotalListingsValue,
} from './universalis.js';

describe('parseItemData', () => {
  it('should parse item data with all fields', () => {
    const rawData = {
      itemID: 32833,
      hasData: true,
      listings: [
        { pricePerUnit: 10000, quantity: 1, total: 10000 },
        { pricePerUnit: 12000, quantity: 25, total: 300000 },
      ],
      listingsCount: 2,
      unitsForSale: 26,
      recentHistory: [
        { pricePerUnit: 12000, quantity: 25, timestamp: 1762654159, total: 300000 },
        { pricePerUnit: 11000, quantity: 10, timestamp: 1761441003, total: 110000 },
      ],
      recentHistoryCount: 2,
      unitsSold: 35,
      currentAveragePrice: 11500,
      currentAveragePriceNQ: 11500,
      currentAveragePriceHQ: 0,
      averagePrice: 12000,
      averagePriceNQ: 12000,
      averagePriceHQ: 0,
      minPrice: 10000,
      minPriceNQ: 10000,
      minPriceHQ: 0,
      maxPrice: 12000,
      maxPriceNQ: 12000,
      maxPriceHQ: 0,
      regularSaleVelocity: 2.5,
      nqSaleVelocity: 2.5,
      hqSaleVelocity: 0,
      stackSizeHistogram: { '1': 1, '25': 1 },
      stackSizeHistogramNQ: { '1': 1, '25': 1 },
      stackSizeHistogramHQ: {},
      lastUploadTime: 1764492657342,
      dcName: 'Materia',
      worldUploadTimes: { '21': 1763725248731 },
    };

    const parsed = parseItemData(rawData);

    expect(parsed.itemID).toBe(32833);
    expect(parsed.hasData).toBe(true);
    expect(parsed.listings).toHaveLength(2);
    expect(parsed.listingsCount).toBe(2);
    expect(parsed.unitsForSale).toBe(26);
    expect(parsed.recentHistory).toHaveLength(2);
    expect(parsed.recentHistoryCount).toBe(2);
    expect(parsed.unitsSold).toBe(35);
    expect(parsed.prices.currentAverage).toBe(11500);
    expect(parsed.prices.min).toBe(10000);
    expect(parsed.prices.max).toBe(12000);
    expect(parsed.saleVelocity.regular).toBe(2.5);
    expect(parsed.dcName).toBe('Materia');
  });

  it('should handle item with no data', () => {
    const rawData = {
      itemID: 99999,
      hasData: false,
    };

    const parsed = parseItemData(rawData);

    expect(parsed.itemID).toBe(99999);
    expect(parsed.hasData).toBe(false);
    expect(parsed.error).toBe('No market data available for this item');
    expect(parsed.listings).toEqual([]);
    expect(parsed.prices.currentAverage).toBe(0);
  });

  it('should handle null/undefined input', () => {
    const parsed = parseItemData(null);

    expect(parsed.itemID).toBeNull();
    expect(parsed.hasData).toBe(false);
    expect(parsed.error).toBe('No market data available for this item');
  });

  it('should handle missing optional fields', () => {
    const rawData = {
      itemID: 32833,
      hasData: true,
    };

    const parsed = parseItemData(rawData);

    expect(parsed.itemID).toBe(32833);
    expect(parsed.hasData).toBe(true);
    expect(parsed.listings).toEqual([]);
    expect(parsed.listingsCount).toBe(0);
    expect(parsed.unitsForSale).toBe(0);
    expect(parsed.prices.currentAverage).toBe(0);
    expect(parsed.saleVelocity.regular).toBe(0);
    expect(parsed.stackSizeHistogram).toEqual({});
  });
});

describe('getCheapestListing', () => {
  it('should return the cheapest listing', () => {
    const itemData = {
      hasData: true,
      listings: [
        { pricePerUnit: 12000, quantity: 25, total: 300000 },
        { pricePerUnit: 10000, quantity: 1, total: 10000 },
        { pricePerUnit: 15000, quantity: 10, total: 150000 },
      ],
    };

    const cheapest = getCheapestListing(itemData);

    expect(cheapest).not.toBeNull();
    expect(cheapest.pricePerUnit).toBe(10000);
  });

  it('should return null when no listings', () => {
    const itemData = {
      hasData: true,
      listings: [],
    };

    const cheapest = getCheapestListing(itemData);
    expect(cheapest).toBeNull();
  });

  it('should return null when hasData is false', () => {
    const itemData = {
      hasData: false,
      listings: [{ pricePerUnit: 10000 }],
    };

    const cheapest = getCheapestListing(itemData);
    expect(cheapest).toBeNull();
  });

  it('should return null when listings is missing', () => {
    const itemData = {
      hasData: true,
    };

    const cheapest = getCheapestListing(itemData);
    expect(cheapest).toBeNull();
  });

  it('should handle single listing', () => {
    const itemData = {
      hasData: true,
      listings: [{ pricePerUnit: 10000, quantity: 1, total: 10000 }],
    };

    const cheapest = getCheapestListing(itemData);
    expect(cheapest.pricePerUnit).toBe(10000);
  });
});

describe('getMostRecentSale', () => {
  it('should return the most recent sale', () => {
    const itemData = {
      hasData: true,
      recentHistory: [
        { pricePerUnit: 12000, timestamp: 1761441003, total: 300000 },
        { pricePerUnit: 11000, timestamp: 1762654159, total: 110000 },
        { pricePerUnit: 10000, timestamp: 1759022696, total: 100000 },
      ],
    };

    const mostRecent = getMostRecentSale(itemData);

    expect(mostRecent).not.toBeNull();
    expect(mostRecent.timestamp).toBe(1762654159);
    expect(mostRecent.pricePerUnit).toBe(11000);
  });

  it('should return null when no sales history', () => {
    const itemData = {
      hasData: true,
      recentHistory: [],
    };

    const mostRecent = getMostRecentSale(itemData);
    expect(mostRecent).toBeNull();
  });

  it('should return null when hasData is false', () => {
    const itemData = {
      hasData: false,
      recentHistory: [{ pricePerUnit: 10000, timestamp: 1762654159 }],
    };

    const mostRecent = getMostRecentSale(itemData);
    expect(mostRecent).toBeNull();
  });

  it('should return null when recentHistory is missing', () => {
    const itemData = {
      hasData: true,
    };

    const mostRecent = getMostRecentSale(itemData);
    expect(mostRecent).toBeNull();
  });

  it('should handle single sale', () => {
    const itemData = {
      hasData: true,
      recentHistory: [{ pricePerUnit: 10000, timestamp: 1762654159, total: 100000 }],
    };

    const mostRecent = getMostRecentSale(itemData);
    expect(mostRecent.timestamp).toBe(1762654159);
  });
});

describe('getTotalListingsValue', () => {
  it('should calculate total value of all listings', () => {
    const itemData = {
      hasData: true,
      listings: [
        { total: 10000 },
        { total: 300000 },
        { total: 150000 },
      ],
    };

    const total = getTotalListingsValue(itemData);
    expect(total).toBe(460000);
  });

  it('should return 0 when no listings', () => {
    const itemData = {
      hasData: true,
      listings: [],
    };

    const total = getTotalListingsValue(itemData);
    expect(total).toBe(0);
  });

  it('should return 0 when hasData is false', () => {
    const itemData = {
      hasData: false,
      listings: [{ total: 10000 }],
    };

    const total = getTotalListingsValue(itemData);
    expect(total).toBe(0);
  });

  it('should return 0 when listings is missing', () => {
    const itemData = {
      hasData: true,
    };

    const total = getTotalListingsValue(itemData);
    expect(total).toBe(0);
  });

  it('should handle single listing', () => {
    const itemData = {
      hasData: true,
      listings: [{ total: 10000 }],
    };

    const total = getTotalListingsValue(itemData);
    expect(total).toBe(10000);
  });
});

describe('fetchMarketData', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch data for single item without world name', async () => {
    const mockResponse = {
      itemID: 32833,
      hasData: true,
      listings: [],
      recentHistory: [],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchMarketData([32833]);

    expect(global.fetch).toHaveBeenCalledWith('https://universalis.app/api/v2/32833');
    expect(result).toEqual(mockResponse);
  });

  it('should fetch data for single item with world name', async () => {
    const mockResponse = {
      itemID: 32833,
      hasData: true,
      listings: [],
      recentHistory: [],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchMarketData([32833], 'Materia');

    expect(global.fetch).toHaveBeenCalledWith('https://universalis.app/api/v2/Materia/32833');
    expect(result).toEqual(mockResponse);
  });

  it('should fetch data for multiple items', async () => {
    const mockResponse = {
      itemIDs: [32833, 32834],
      items: {
        '32833': { itemID: 32833, hasData: true, listings: [], recentHistory: [] },
        '32834': { itemID: 32834, hasData: true, listings: [], recentHistory: [] },
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchMarketData([32833, 32834]);

    expect(global.fetch).toHaveBeenCalledWith('https://universalis.app/api/v2/32833,32834');
    expect(result).toEqual(mockResponse);
  });

  it('should filter out invalid item IDs', async () => {
    const mockResponse = {
      itemID: 32833,
      hasData: true,
      listings: [],
      recentHistory: [],
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchMarketData([32833, 'invalid', null, undefined, NaN]);

    expect(global.fetch).toHaveBeenCalledWith('https://universalis.app/api/v2/32833');
    expect(result).toEqual(mockResponse);
  });

  it('should throw error for empty itemIDs array', async () => {
    await expect(fetchMarketData([])).rejects.toThrow('itemIDs array cannot be empty');
  });

  it('should throw error for null itemIDs', async () => {
    await expect(fetchMarketData(null)).rejects.toThrow('itemIDs array cannot be empty');
  });

  it('should throw error when all item IDs are invalid', async () => {
    await expect(fetchMarketData(['invalid', null, undefined])).rejects.toThrow('No valid item IDs provided');
  });

  it('should throw error for API error response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchMarketData([32833])).rejects.toThrow('Universalis API error: 404 Not Found');
  });

  it('should handle network errors', async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(fetchMarketData([32833])).rejects.toThrow('Network error: Unable to connect to Universalis API');
  });

  it('should handle other errors', async () => {
    const customError = new Error('Custom error');
    global.fetch.mockRejectedValueOnce(customError);

    await expect(fetchMarketData([32833])).rejects.toThrow('Custom error');
  });
});

describe('getItemMarketData', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and parse single item data', async () => {
    const mockResponse = {
      itemID: 32833,
      hasData: true,
      listings: [{ pricePerUnit: 10000, quantity: 1, total: 10000 }],
      listingsCount: 1,
      unitsForSale: 1,
      recentHistory: [],
      recentHistoryCount: 0,
      unitsSold: 0,
      currentAveragePrice: 10000,
      currentAveragePriceNQ: 10000,
      currentAveragePriceHQ: 0,
      averagePrice: 10000,
      averagePriceNQ: 10000,
      averagePriceHQ: 0,
      minPrice: 10000,
      minPriceNQ: 10000,
      minPriceHQ: 0,
      maxPrice: 10000,
      maxPriceNQ: 10000,
      maxPriceHQ: 0,
      regularSaleVelocity: 0,
      nqSaleVelocity: 0,
      hqSaleVelocity: 0,
      stackSizeHistogram: {},
      stackSizeHistogramNQ: {},
      stackSizeHistogramHQ: {},
      lastUploadTime: 1764492657342,
      dcName: 'Materia',
      worldUploadTimes: {},
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getItemMarketData([32833]);

    expect(result.itemID).toBe(32833);
    expect(result.hasData).toBe(true);
    expect(result.listings).toHaveLength(1);
    expect(result.prices.currentAverage).toBe(10000);
  });

  it('should fetch and parse multiple items data', async () => {
    const mockResponse = {
      itemIDs: [32833, 32834],
      items: {
        '32833': {
          itemID: 32833,
          hasData: true,
          listings: [],
          recentHistory: [],
          currentAveragePrice: 10000,
          minPrice: 10000,
          maxPrice: 10000,
        },
        '32834': {
          itemID: 32834,
          hasData: true,
          listings: [],
          recentHistory: [],
          currentAveragePrice: 15000,
          minPrice: 15000,
          maxPrice: 15000,
        },
      },
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getItemMarketData([32833, 32834]);

    expect(result.itemIDs).toEqual([32833, 32834]);
    expect(result.items['32833'].itemID).toBe(32833);
    expect(result.items['32834'].itemID).toBe(32834);
    expect(result.items['32833'].prices.currentAverage).toBe(10000);
    expect(result.items['32834'].prices.currentAverage).toBe(15000);
  });

  it('should handle item with no data', async () => {
    const mockResponse = {
      itemID: 99999,
      hasData: false,
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getItemMarketData([99999]);

    expect(result.itemID).toBe(99999);
    expect(result.hasData).toBe(false);
    expect(result.error).toBe('No market data available for this item');
  });

  it('should throw error for unexpected response format', async () => {
    const mockResponse = {
      unexpected: 'format',
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await expect(getItemMarketData([32833])).rejects.toThrow('Unexpected response format from Universalis API');
  });

  it('should propagate fetch errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(getItemMarketData([32833])).rejects.toThrow('Universalis API error: 404 Not Found');
  });
});

describe('Integration tests with real API (optional)', () => {
  // These tests make real API calls and should be skipped in CI or run conditionally
  it.skip('should fetch real data for a known item', async () => {
    const result = await getItemMarketData([32833]);
    
    expect(result).toBeDefined();
    if (result.hasData) {
      expect(result.itemID).toBe(32833);
      expect(result.prices).toBeDefined();
      expect(typeof result.prices.currentAverage).toBe('number');
    }
  }, 10000); // 10 second timeout for real API call
});
