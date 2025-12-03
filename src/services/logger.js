/**
 * Logger Service
 * 
 * Provides structured logging for user requests and API call progress
 */

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
};

/**
 * Format timestamp for logs
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 * @returns {string} Formatted log message
 */
function formatLog(level, message, data = null) {
  const timestamp = getTimestamp();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data }),
  };
  return JSON.stringify(logEntry, null, 2);
}

/**
 * Log info message
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
function logInfo(message, data = null) {
  const log = formatLog(LOG_LEVELS.INFO, message, data);
  console.log(`[${LOG_LEVELS.INFO}] ${log}`);
}

/**
 * Log warning message
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
function logWarn(message, data = null) {
  const log = formatLog(LOG_LEVELS.WARN, message, data);
  console.warn(`[${LOG_LEVELS.WARN}] ${log}`);
}

/**
 * Log error message
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
function logError(message, data = null) {
  const log = formatLog(LOG_LEVELS.ERROR, message, data);
  console.error(`[${LOG_LEVELS.ERROR}] ${log}`);
}

/**
 * Log debug message
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
function logDebug(message, data = null) {
  const log = formatLog(LOG_LEVELS.DEBUG, message, data);
  console.debug(`[${LOG_LEVELS.DEBUG}] ${log}`);
}

/**
 * Log user request
 * @param {Object} requestData - Request data
 */
function logUserRequest(requestData) {
  logInfo('User request received', {
    worldName: requestData.worldName,
    listingsLimit: requestData.listingsLimit,
    entriesLimit: requestData.entriesLimit,
    itemCount: requestData.itemCount,
    timestamp: getTimestamp(),
  });
}

/**
 * Log API call start
 * @param {Object} apiCallData - API call data
 */
function logApiCallStart(apiCallData) {
  logInfo('Universalis API call started', {
    url: apiCallData.url,
    itemIDs: apiCallData.itemIDs,
    itemCount: apiCallData.itemIDs?.length || 0,
    worldName: apiCallData.worldName,
    listingsLimit: apiCallData.listingsLimit,
    entriesLimit: apiCallData.entriesLimit,
    batchNumber: apiCallData.batchNumber,
    totalBatches: apiCallData.totalBatches,
  });
}

/**
 * Log API call success
 * @param {Object} apiCallData - API call data
 */
function logApiCallSuccess(apiCallData) {
  logInfo('Universalis API call completed', {
    url: apiCallData.url,
    itemCount: apiCallData.itemIDs?.length || 0,
    responseTime: apiCallData.responseTime,
    batchNumber: apiCallData.batchNumber,
    totalBatches: apiCallData.totalBatches,
  });
}

/**
 * Log API call error
 * @param {Object} apiCallData - API call error data
 */
function logApiCallError(apiCallData) {
  logError('Universalis API call failed', {
    url: apiCallData.url,
    itemIDs: apiCallData.itemIDs,
    error: apiCallData.error,
    batchNumber: apiCallData.batchNumber,
    totalBatches: apiCallData.totalBatches,
  });
}

/**
 * Log cache hit
 * @param {Object} cacheData - Cache data
 */
function logCacheHit(cacheData) {
  logDebug('Cache hit', {
    cacheKey: cacheData.cacheKey,
    itemCount: cacheData.itemCount,
    age: cacheData.age,
  });
}

/**
 * Log cache miss
 * @param {Object} cacheData - Cache data
 */
function logCacheMiss(cacheData) {
  logDebug('Cache miss', {
    cacheKey: cacheData.cacheKey,
    itemCount: cacheData.itemCount,
  });
}

/**
 * Log batch progress
 * @param {Object} progressData - Progress data
 */
function logBatchProgress(progressData) {
  logInfo('Batch progress update', {
    currentBatch: progressData.currentBatch,
    totalBatches: progressData.totalBatches,
    progress: progressData.progress,
    percentage: `${progressData.progress}%`,
  });
}

/**
 * Log delay between API calls
 * @param {number} delayMs - Delay in milliseconds
 */
function logDelay(delayMs) {
  logDebug(`Waiting ${delayMs}ms before next API call`);
}

export {
  logInfo,
  logWarn,
  logError,
  logDebug,
  logUserRequest,
  logApiCallStart,
  logApiCallSuccess,
  logApiCallError,
  logCacheHit,
  logCacheMiss,
  logBatchProgress,
  logDelay,
  LOG_LEVELS,
};
