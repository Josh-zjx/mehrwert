/**
 * Expected profit: the item's largest listed quantity sold at the cheapest unit
 * price currently on the board. Shared by the card that shows it and the hot
 * list that sorts by it, so both always agree.
 */

/**
 * Cheapest unit price among the fetched listings, or null when there is none.
 * @param {Object|null} marketData - Parsed Universalis data for one item
 * @returns {number|null}
 */
export function cheapestListing(marketData) {
  const prices = (marketData?.listings ?? [])
    .map(listing => listing.pricePerUnit)
    .filter(price => price > 0);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * @param {{ quantity: number|null, marketData: Object|null }} item
 * @returns {number|null} Gil, or null when there is nothing to price against
 */
export function expectedProfit(item) {
  const cheapest = cheapestListing(item.marketData);
  if (!item.quantity || cheapest === null) return null;
  return item.quantity * cheapest;
}

/**
 * Sort comparator: highest expected profit first, items without one last.
 * Stable, so ties keep their incoming order.
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function byExpectedProfit(a, b) {
  return (expectedProfit(b) ?? -1) - (expectedProfit(a) ?? -1);
}
