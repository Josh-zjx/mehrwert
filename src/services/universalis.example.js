/**
 * Example usage of the Universalis API service
 * 
 * This file demonstrates how to use the universalis service module
 * to fetch and parse item price and sales information.
 */

import { 
  getItemMarketData, 
  getCheapestListing, 
  getMostRecentSale,
  getTotalListingsValue 
} from './universalis.js';

/**
 * Example: Fetch market data for a single item
 */
async function exampleSingleItem() {
  try {
    const itemID = 32833; // Example item ID
    const marketData = await getItemMarketData([itemID]);
    
    console.log('Item ID:', marketData.itemID);
    console.log('Has Data:', marketData.hasData);
    
    if (marketData.hasData) {
      console.log('Current Average Price:', marketData.prices.currentAverage);
      console.log('Min Price:', marketData.prices.min);
      console.log('Max Price:', marketData.prices.max);
      console.log('Listings Count:', marketData.listingsCount);
      console.log('Units For Sale:', marketData.unitsForSale);
      console.log('Sale Velocity:', marketData.saleVelocity.regular, 'items/day');
      
      const cheapest = getCheapestListing(marketData);
      if (cheapest) {
        console.log('Cheapest Listing:', cheapest.pricePerUnit, 'gil per unit');
      }
      
      const recentSale = getMostRecentSale(marketData);
      if (recentSale) {
        console.log('Most Recent Sale:', recentSale.pricePerUnit, 'gil per unit');
      }
    }
  } catch (error) {
    console.error('Error fetching item data:', error);
  }
}

/**
 * Example: Fetch market data for multiple items
 */
async function exampleMultipleItems() {
  try {
    const itemIDs = [32833, 32834, 32835]; // Example item IDs
    const marketData = await getItemMarketData(itemIDs);
    
    console.log('Fetched data for items:', marketData.itemIDs);
    
    for (const itemID of marketData.itemIDs) {
      const itemData = marketData.items[itemID];
      
      if (itemData.hasData) {
        console.log(`\nItem ${itemID}:`);
        console.log('  Average Price:', itemData.prices.currentAverage);
        console.log('  Listings:', itemData.listingsCount);
        console.log('  Units For Sale:', itemData.unitsForSale);
      } else {
        console.log(`\nItem ${itemID}: No data available`);
      }
    }
  } catch (error) {
    console.error('Error fetching multiple items:', error);
  }
}

/**
 * Example: Fetch market data for a specific world
 */
async function exampleSpecificWorld() {
  try {
    const itemIDs = [32833];
    const worldName = 'Materia'; // Data Center name
    const marketData = await getItemMarketData(itemIDs, worldName);
    
    console.log('World:', marketData.dcName);
    console.log('Average Price:', marketData.prices.currentAverage);
  } catch (error) {
    console.error('Error fetching world-specific data:', error);
  }
}

/**
 * Example: Calculate total market value
 */
async function exampleMarketValue() {
  try {
    const itemID = 32833;
    const marketData = await getItemMarketData([itemID]);
    
    if (marketData.hasData) {
      const totalValue = getTotalListingsValue(marketData);
      console.log('Total value of all listings:', totalValue, 'gil');
      console.log('Average price per unit:', marketData.prices.currentAverage);
      console.log('Total units for sale:', marketData.unitsForSale);
    }
  } catch (error) {
    console.error('Error calculating market value:', error);
  }
}

// Uncomment to run examples:
// exampleSingleItem();
// exampleMultipleItems();
// exampleSpecificWorld();
// exampleMarketValue();
