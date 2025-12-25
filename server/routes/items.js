/**
 * Items API Routes
 * 
 * RESTful API endpoints for item data
 */

import express from 'express';
import { handleApiError } from '../utils/common.js';
import {
  getItem,
  getAllItems,
  getItemsByClassification,
} from '../services/itemManager.js';

const router = express.Router();

/**
 * GET /api/items
 * Get all items
 * Query params:
 *   - classification: filter by 'hot', 'mild', or 'cold'
 */
router.get('/', (req, res) => {
  try {
    const { classification } = req.query;

    let items;
    if (classification) {
      items = getItemsByClassification(classification);
    } else {
      items = getAllItems();
    }

    res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

/**
 * GET /api/items/:id
 * Get item by ID
 */
router.get('/:id', (req, res) => {
  try {
    const itemID = parseInt(req.params.id, 10);

    if (isNaN(itemID)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item ID',
      });
    }

    const item = getItem(itemID);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    res.json({
      success: true,
      item,
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

/**
 * GET /api/items/batch/:ids
 * Get multiple items by IDs (comma-separated)
 */
router.get('/batch/:ids', (req, res) => {
  try {
    const ids = req.params.ids.split(',').map(id => parseInt(id.trim(), 10));

    if (ids.some(id => isNaN(id))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid item IDs',
      });
    }

    const items = ids
      .map(id => getItem(id))
      .filter(item => item !== null);

    res.json({
      success: true,
      count: items.length,
      requested: ids.length,
      items,
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

export default router;
