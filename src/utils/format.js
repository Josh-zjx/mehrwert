/**
 * Display formatting shared by the market components.
 */

const NONE = 'N/A';

/**
 * Gil amounts. Zero means "no listing", which is not a price.
 * @param {number|null|undefined} price
 * @returns {string}
 */
export function formatPrice(price) {
  if (!price) return NONE;
  return price.toLocaleString('en-US');
}

/**
 * Plain counts.
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value === null || value === undefined) return NONE;
  return value.toLocaleString('en-US');
}

/**
 * Units sold per day: one decimal while small, whole numbers once large.
 * @param {number|null|undefined} velocity
 * @returns {string}
 */
export function formatVelocity(velocity) {
  if (velocity === null || velocity === undefined) return NONE;
  if (velocity >= 100) return Math.round(velocity).toLocaleString('en-US');
  return velocity.toFixed(1);
}

/**
 * Two-digit rank, or a dash when the item has no recorded sales.
 * @param {number|null|undefined} rank - 1-based
 * @returns {string}
 */
export function formatRank(rank) {
  if (!rank) return '—';
  return String(rank).padStart(2, '0');
}

/**
 * Full local timestamp, for places where precision matters.
 * @param {number|null|undefined} timestamp - Milliseconds since epoch
 * @returns {string}
 */
export function formatDate(timestamp) {
  if (!timestamp) return NONE;
  return new Date(timestamp).toLocaleString();
}

const RELATIVE_UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/**
 * "12 minutes ago" style timestamp, falling back to a date past a week.
 * @param {number|null|undefined} timestamp - Milliseconds since epoch
 * @param {number} [now] - Reference time, for tests
 * @returns {string}
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return NONE;

  const elapsed = now - timestamp;
  if (elapsed < 60_000) return 'just now';
  if (elapsed > 7 * 86_400_000) return new Date(timestamp).toLocaleDateString();

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  const [unit, ms] = RELATIVE_UNITS.find(([, ms]) => elapsed >= ms);
  return formatter.format(-Math.round(elapsed / ms), unit);
}
