/**
 * Database Service
 * 
 * SQLite database operations for persistent item storage
 * Handles missing database files gracefully
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path
const DB_PATH = join(__dirname, '../../data/items.db');
const DB_DIR = join(__dirname, '../../data');

let db = null;
let dbInitialized = false;

/**
 * Initialize database connection and create schema if needed
 * @returns {Database|null} Database instance or null if initialization fails
 */
function initializeDatabase() {
  if (dbInitialized && db) {
    return db;
  }

  try {
    // Create data directory if it doesn't exist
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }

    // Open database (creates file if it doesn't exist)
    db = new Database(DB_PATH);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    // Create schema if tables don't exist
    createSchema();
    
    dbInitialized = true;
    console.log(`[Database] Connected to ${DB_PATH}`);
    return db;
  } catch (error) {
    console.error(`[Database] Failed to initialize database:`, error.message);
    db = null;
    dbInitialized = false;
    return null;
  }
}

/**
 * Create database schema
 */
function createSchema() {
  if (!db) return;

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        number TEXT NOT NULL DEFAULT '[]',
        req TEXT NOT NULL DEFAULT '[]',
        marketData TEXT NOT NULL DEFAULT '{}',
        classification TEXT NOT NULL DEFAULT 'cold',
        lastUpdate INTEGER,
        nextUpdate INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_classification ON items(classification);
      CREATE INDEX IF NOT EXISTS idx_nextUpdate ON items(nextUpdate);
    `);
    
    console.log(`[Database] Schema initialized`);
  } catch (error) {
    console.error(`[Database] Failed to create schema:`, error.message);
    throw error;
  }
}

/**
 * Get database instance, initializing if needed
 * @returns {Database|null} Database instance or null if unavailable
 */
function getDb() {
  if (!dbInitialized) {
    return initializeDatabase();
  }
  return db;
}

/**
 * Safely execute a database operation with error handling
 * @param {Function} operation - Function that performs the database operation
 * @param {*} defaultValue - Default value to return if operation fails
 * @returns {*} Result of operation or defaultValue
 */
function safeDbOperation(operation, defaultValue = null) {
  try {
    const database = getDb();
    if (!database) {
      // Silently return default - database may not be initialized yet
      return defaultValue;
    }
    return operation(database);
  } catch (error) {
    // Log error but don't crash - return default value
    console.error(`[Database] Operation failed:`, error.message);
    // Try to reinitialize database if it was closed/corrupted
    if (error.message.includes('database is locked') || 
        error.message.includes('no such table') ||
        error.message.includes('SQLITE_CORRUPT')) {
      console.log(`[Database] Attempting to reinitialize database...`);
      dbInitialized = false;
      db = null;
      const newDb = initializeDatabase();
      if (newDb) {
        // Retry operation once
        try {
          return operation(newDb);
        } catch (retryError) {
          console.error(`[Database] Retry failed:`, retryError.message);
        }
      }
    }
    return defaultValue;
  }
}

/**
 * Upsert (insert or update) an item in the database
 * @param {Object} itemData - Item data object
 * @returns {boolean} Success status
 */
export function upsertItem(itemData) {
  return safeDbOperation((db) => {
    const stmt = db.prepare(`
      INSERT INTO items (
        id, name, number, req, marketData, classification, lastUpdate, nextUpdate, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        number = excluded.number,
        req = excluded.req,
        marketData = excluded.marketData,
        classification = excluded.classification,
        lastUpdate = excluded.lastUpdate,
        nextUpdate = excluded.nextUpdate,
        updatedAt = strftime('%s', 'now')
    `);

    stmt.run(
      itemData.id,
      itemData.name || `Item ${itemData.id}`,
      JSON.stringify(itemData.number || []),
      JSON.stringify(itemData.req || []),
      JSON.stringify(itemData.marketData || {}),
      itemData.classification || 'cold',
      itemData.lastUpdate || null,
      itemData.nextUpdate || null
    );

    return true;
  }, false);
}

/**
 * Get item by ID
 * @param {number} itemID - Item ID
 * @returns {Object|null} Item data or null if not found
 */
export function getItemById(itemID) {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
    const row = stmt.get(itemID);
    
    if (!row) {
      return null;
    }

    // Parse JSON fields
    return {
      id: row.id,
      name: row.name,
      number: JSON.parse(row.number || '[]'),
      req: JSON.parse(row.req || '[]'),
      marketData: JSON.parse(row.marketData || '{}'),
      classification: row.classification,
      lastUpdate: row.lastUpdate,
      nextUpdate: row.nextUpdate,
    };
  }, null);
}

/**
 * Get all items from database
 * @returns {Array} Array of item data
 */
export function getAllItems() {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT * FROM items');
    const rows = stmt.all();
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      number: JSON.parse(row.number || '[]'),
      req: JSON.parse(row.req || '[]'),
      marketData: JSON.parse(row.marketData || '{}'),
      classification: row.classification,
      lastUpdate: row.lastUpdate,
      nextUpdate: row.nextUpdate,
    }));
  }, []);
}

/**
 * Get items by classification
 * @param {string} classification - 'hot', 'mild', or 'cold'
 * @returns {Array} Array of items with the specified classification
 */
export function getItemsByClassification(classification) {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT * FROM items WHERE classification = ?');
    const rows = stmt.all(classification);
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      number: JSON.parse(row.number || '[]'),
      req: JSON.parse(row.req || '[]'),
      marketData: JSON.parse(row.marketData || '{}'),
      classification: row.classification,
      lastUpdate: row.lastUpdate,
      nextUpdate: row.nextUpdate,
    }));
  }, []);
}

/**
 * Get all item IDs from database
 * @returns {Set} Set of item IDs
 */
export function getAllItemIds() {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT id FROM items');
    const rows = stmt.all();
    return new Set(rows.map(row => row.id));
  }, new Set());
}

/**
 * Get items that need updating based on nextUpdate timestamp
 * @param {number} now - Current timestamp
 * @returns {Object} Items grouped by classification that need updating
 */
export function getItemsNeedingUpdate(now) {
  return safeDbOperation((db) => {
    const stmt = db.prepare(`
      SELECT id, classification 
      FROM items 
      WHERE nextUpdate IS NOT NULL AND nextUpdate <= ?
    `);
    const rows = stmt.all(now);
    
    const hotItems = [];
    const mildItems = [];
    const coldItems = [];
    
    for (const row of rows) {
      switch (row.classification) {
        case 'hot':
          hotItems.push(row.id);
          break;
        case 'mild':
          mildItems.push(row.id);
          break;
        case 'cold':
          coldItems.push(row.id);
          break;
      }
    }
    
    return {
      hot: hotItems,
      mild: mildItems,
      cold: coldItems,
    };
  }, { hot: [], mild: [], cold: [] });
}

/**
 * Check if item exists in database
 * @param {number} itemID - Item ID
 * @returns {boolean} True if item exists
 */
export function hasItem(itemID) {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM items WHERE id = ?');
    const result = stmt.get(itemID);
    return result.count > 0;
  }, false);
}

/**
 * Get total count of items in database
 * @returns {number} Item count
 */
export function getItemCount() {
  return safeDbOperation((db) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM items');
    const result = stmt.get();
    return result.count;
  }, 0);
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    try {
      db.close();
      console.log(`[Database] Connection closed`);
    } catch (error) {
      console.error(`[Database] Error closing connection:`, error.message);
    }
    db = null;
    dbInitialized = false;
  }
}

// Initialize database on module load
initializeDatabase();

// Handle graceful shutdown
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
