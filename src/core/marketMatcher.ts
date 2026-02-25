/**
 * Market Matcher
 * Matches markets between Polymarket and Kalshi based on criteria
 */

import { MarketData } from '../types/market';
import { PolymarketClient } from '../clients/polymarket';
import { KalshiClient } from '../clients/kalshi';

export class MarketMatcher {
  private polymarket: PolymarketClient;
  private kalshi: KalshiClient;

  constructor(polymarket: PolymarketClient, kalshi: KalshiClient) {
    this.polymarket = polymarket;
    this.kalshi = kalshi;
  }

  /**
   * Matches 15-minute BTC markets between Polymarket and Kalshi
   */
  async matchMarkets(): Promise<MarketData[]> {
    try {
      // Fetch active markets from both platforms
      const [polyMarkets, kalshiMarkets] = await Promise.all([
        this.polymarket.getActiveBTCMarkets(),
        this.kalshi.getActiveBTCMarkets(),
      ]);

      const matchedMarkets: MarketData[] = [];

      // Match markets based on similar end times and titles
      for (const polyMarket of polyMarkets) {
        const kalshiMarket = this.findMatchingKalshiMarket(polyMarket, kalshiMarkets);
        
        if (kalshiMarket) {
          // Fetch current prices for both markets
          const [polyPrices, kalshiPrices] = await Promise.all([
            this.polymarket.getMarketPrices(polyMarket.id),
            this.kalshi.getMarketPrices(kalshiMarket.ticker),
          ]);

          matchedMarkets.push({
            marketId: polyMarket.id,
            marketTitle: polyMarket.question || polyMarket.title,
            endTime: polyMarket.endDate || kalshiMarket.expiration_time,
            isResolved: polyMarket.resolved || kalshiMarket.status === 'resolved',
            resolvedPrice: polyMarket.resolvedPrice || kalshiMarket.betted_price,
            polymarket: polyPrices,
            kalshi: kalshiPrices,
          });
        }
      }

      return matchedMarkets;
    } catch (error) {
      console.error('[MarketMatcher] Error matching markets:', error);
      return [];
    }
  }

  /**
   * Finds a matching Kalshi market for a Polymarket market
   */
  private findMatchingKalshiMarket(polyMarket: any, kalshiMarkets: any[]): any | null {
    // Match based on:
    // 1. Similar end time (within 1 minute)
    // 2. Similar title/question
    // 3. Same underlying asset (BTC)
    
    const polyEndTime = new Date(polyMarket.endDate || polyMarket.end_time).getTime();
    
    for (const kalshiMarket of kalshiMarkets) {
      const kalshiEndTime = new Date(kalshiMarket.expiration_time).getTime();
      const timeDiff = Math.abs(polyEndTime - kalshiEndTime);
      
      // Match if end times are within 1 minute and both are BTC 15m markets
      if (timeDiff < 60000 && 
          kalshiMarket.series_ticker?.includes('BTC-15M')) {
        return kalshiMarket;
      }
    }

    return null;
  }
}
