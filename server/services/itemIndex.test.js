import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const fetchAggregated = vi.fn();

vi.mock('./universalisClient.js', () => ({
  fetchAggregated: (...args) => fetchAggregated(...args),
  fetchDataCenters: vi.fn(),
  MAX_ITEMS_PER_CALL: 100,
}));

const DCS = [
  { name: 'Aether', region: 'North-America', worldCount: 8 },
  { name: '猫小胖', region: '中国', worldCount: 7 },
];

vi.mock('./dataCenters.js', () => ({
  getDataCenterNames: () => DCS.map(dc => dc.name),
  isKnownDataCenter: (name) => DCS.some(dc => dc.name === name),
  getDataCenters: () => DCS,
  loadDataCenters: vi.fn(),
}));

// Keep retry backoff from making the suite slow
vi.mock('../utils/common.js', async (importOriginal) => ({
  ...(await importOriginal()),
  delay: () => Promise.resolve(),
}));

let dataDir;

/**
 * Load a fresh copy of the module so its in-memory index starts empty
 */
async function loadModule() {
  vi.resetModules();
  return await import('./itemIndex.js');
}

/**
 * Build an aggregated-endpoint response for a batch
 */
function respond(batch, velocityFor, { hq = 0 } = {}) {
  return {
    results: batch.map(id => ({
      itemId: id,
      nq: { dailySaleVelocity: { dc: { quantity: velocityFor(id) } } },
      hq: hq ? { dailySaleVelocity: { dc: { quantity: hq } } } : {},
    })),
  };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'mehrwert-test-'));
  process.env.DATA_DIR = dataDir;
  fetchAggregated.mockReset();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe('sweep', () => {
  it('indexes every unique item and exposes thresholds', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();
    fetchAggregated.mockImplementation(batch => respond(batch, id => id % 2000));

    await sweep('猫小胖');
    const index = getIndex('猫小胖');

    expect(index.dataCenter).toBe('猫小胖');
    expect(index.indexed).toBe(ITEM_IDS.length);
    expect(index.total).toBe(ITEM_IDS.length);
    expect(index.sweeping).toBe(false);
    expect(index.updatedAt).toBeTypeOf('number');
    expect(index.hotLimit).toBe(50);
    expect(index.mildThreshold).toBe(14);
    expect(index.velocities[ITEM_IDS[0]]).toBe(ITEM_IDS[0] % 2000);
  });

  it('requests batches of at most MAX_ITEMS_PER_CALL', async () => {
    const { sweep, ITEM_IDS } = await loadModule();
    fetchAggregated.mockImplementation(batch => respond(batch, () => 1));

    await sweep('猫小胖');

    expect(fetchAggregated).toHaveBeenCalledTimes(Math.ceil(ITEM_IDS.length / 100));
    for (const call of fetchAggregated.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(100);
      expect(call[1]).toBe('猫小胖');
    }
  });

  it('sums NQ and HQ velocity so HQ-traded items are not treated as dead', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();
    fetchAggregated.mockImplementation(batch => respond(batch, () => 10, { hq: 4 }));

    await sweep('猫小胖');

    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(14);
  });

  it('records zero when the data center has no recorded sales', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();
    // Region has volume but the queried DC does not - players cannot trade across DCs
    fetchAggregated.mockImplementation(batch => ({
      results: batch.map(id => ({
        itemId: id,
        nq: { dailySaleVelocity: { region: { quantity: 900 } } },
        hq: {},
      })),
    }));

    await sweep('猫小胖');

    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(0);
  });

  it('retries a transient failure and keeps the recovered value', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();
    let firstCall = true;

    fetchAggregated.mockImplementation(batch => {
      if (firstCall) {
        firstCall = false;
        const error = new Error('Universalis API error: 504 Gateway Timeout');
        error.status = 504;
        return Promise.reject(error);
      }
      return Promise.resolve(respond(batch, () => 1234));
    });

    await sweep('猫小胖');

    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(1234);
  });

  it('does not retry a client error', async () => {
    const { sweep, ITEM_IDS } = await loadModule();
    const error = new Error('Universalis API error: 400 Bad Request');
    error.status = 400;
    fetchAggregated.mockRejectedValue(error);

    await sweep('猫小胖');

    // One attempt per batch, no retries
    expect(fetchAggregated).toHaveBeenCalledTimes(Math.ceil(ITEM_IDS.length / 100));
  });

  it('keeps previously known values when a later sweep fails', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();

    fetchAggregated.mockImplementation(batch => respond(batch, () => 500));
    await sweep('猫小胖');
    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(500);

    const error = new Error('Universalis API error: 504 Gateway Timeout');
    error.status = 504;
    fetchAggregated.mockRejectedValue(error);
    await sweep('猫小胖');

    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(500);
    expect(getIndex('猫小胖').indexed).toBe(ITEM_IDS.length);
  });

  it('persists the index and reloads it on the next start', async () => {
    const first = await loadModule();
    
    fetchAggregated.mockImplementation(batch => respond(batch, () => 42));
    await first.sweep('猫小胖');

    const second = await loadModule();
    second.loadIndex();

    const index = second.getIndex('猫小胖');
    expect(index.indexed).toBe(first.ITEM_IDS.length);
    expect(index.velocities[first.ITEM_IDS[0]]).toBe(42);
  });
});

describe('item list', () => {
  it('deduplicates repeated ids so a sweep fetches each item once', async () => {
    const { ITEM_IDS } = await loadModule();
    expect(new Set(ITEM_IDS).size).toBe(ITEM_IDS.length);
  });
});

describe('multiple data centers', () => {
  it('keeps each data center\'s velocities separate', async () => {
    const { sweep, getIndex, ITEM_IDS } = await loadModule();

    fetchAggregated.mockImplementation((batch, dc) =>
      respond(batch, () => (dc === 'Aether' ? 100 : 900))
    );

    await sweep('Aether');
    await sweep('猫小胖');

    expect(getIndex('Aether').velocities[ITEM_IDS[0]]).toBe(100);
    expect(getIndex('猫小胖').velocities[ITEM_IDS[0]]).toBe(900);
  });

  it('reports an unswept data center as empty rather than failing', async () => {
    const { getIndex, ITEM_IDS } = await loadModule();

    const index = getIndex('Aether');

    expect(index.indexed).toBe(0);
    expect(index.total).toBe(ITEM_IDS.length);
    expect(index.updatedAt).toBeNull();
    expect(index.velocities).toEqual({});
  });

  it('reports coverage per data center, flagging ones with no sales', async () => {
    const { sweep, getCoverage } = await loadModule();

    // A beta data center returns rows but every velocity is zero
    fetchAggregated.mockImplementation((batch, dc) =>
      respond(batch, () => (dc === 'Aether' ? 0 : 42))
    );

    await sweep('Aether');
    await sweep('猫小胖');

    const coverage = getCoverage();
    expect(coverage['Aether'].active).toBe(false);
    expect(coverage['猫小胖'].active).toBe(true);
    expect(coverage['猫小胖'].indexed).toBeGreaterThan(0);
  });

  it('persists and reloads every data center', async () => {
    const first = await loadModule();
    fetchAggregated.mockImplementation((batch, dc) =>
      respond(batch, () => (dc === 'Aether' ? 7 : 8))
    );
    await first.sweep('Aether');
    await first.sweep('猫小胖');

    const second = await loadModule();
    second.loadIndex();

    expect(second.getIndex('Aether').velocities[first.ITEM_IDS[0]]).toBe(7);
    expect(second.getIndex('猫小胖').velocities[first.ITEM_IDS[0]]).toBe(8);
  });
});
