/**
 * Arbitrage Detection Logic
 * Implements the core arbitrage opportunity detection and decision making
 */

import { MarketData, ArbitrageOpportunity, MarketPrice } from '../types/market';

export class ArbitrageDetector {
  private readonly PROFIT_THRESHOLD: number;

  constructor(takeProfit: number = 90) {
    this.PROFIT_THRESHOLD = takeProfit;
  }

  /**
   * Detects arbitrage opportunities between Polymarket and Kalshi
   */
  detectOpportunity(marketData: MarketData): ArbitrageOpportunity | null {
    const { polymarket, kalshi } = marketData;
    
    // Calculate both potential arbitrage scenarios
    const polyUpKalshiDown = polymarket.upPrice + kalshi.downPrice;
    const polyDownKalshiUp = polymarket.downPrice + kalshi.upPrice;

    const hasBothOpportunities = polyUpKalshiDown < this.PROFIT_THRESHOLD && 
                                 polyDownKalshiUp < this.PROFIT_THRESHOLD;
    
    const hasPolyUpKalshiDown = polyUpKalshiDown < this.PROFIT_THRESHOLD;
    const hasPolyDownKalshiUp = polyDownKalshiUp < this.PROFIT_THRESHOLD;

    // If no opportunities, return null
    if (!hasPolyUpKalshiDown && !hasPolyDownKalshiUp) {
      return null;
    }

    // Determine action based on business logic
    const action = this.determineAction(
      hasBothOpportunities,
      hasPolyUpKalshiDown,
      hasPolyDownKalshiUp,
      polymarket,
      kalshi
    );

    if (action === 'skip') {
      return null;
    }

    // Calculate profit potential
    const totalCost = hasBothOpportunities 
      ? Math.min(polyUpKalshiDown, polyDownKalshiUp)
      : hasPolyUpKalshiDown 
        ? polyUpKalshiDown 
        : polyDownKalshiUp;
    
    const profitPotential = ((100 - totalCost) / totalCost) * 100;

    // Determine opportunity type
    let opportunityType: 'both' | 'poly_up_kalshi_down' | 'poly_down_kalshi_up';
    if (hasBothOpportunities) {
      opportunityType = 'both';
    } else if (hasPolyUpKalshiDown) {
      opportunityType = 'poly_up_kalshi_down';
    } else {
      opportunityType = 'poly_down_kalshi_up';
    }

    return {
      marketId: marketData.marketId,
      marketTitle: marketData.marketTitle,
      opportunityType,
      polyUpPrice: polymarket.upPrice,
      polyDownPrice: polymarket.downPrice,
      kalshiUpPrice: kalshi.upPrice,
      kalshiDownPrice: kalshi.downPrice,
      totalCost,
      profitPotential,
      polyBettedPrice: polymarket.bettedPrice,
      kalshiBettedPrice: kalshi.bettedPrice,
      action,
      timestamp: Date.now(),
    };
  }

  /**
   * Determines the trading action based on business logic
   */
  private determineAction(
    hasBoth: boolean,
    hasPolyUpKalshiDown: boolean,
    hasPolyDownKalshiUp: boolean,
    poly: MarketPrice,
    kalshi: MarketPrice
  ): 'buy_poly_up_kalshi_down' | 'buy_poly_down_kalshi_up' | 'skip' {
    const polyBetted = poly.bettedPrice;
    const kalshiBetted = kalshi.bettedPrice;

    // Case 1: Both opportunities exist
    if (hasBoth) {
      // If betted prices are available, use them for decision
      if (polyBetted !== undefined && kalshiBetted !== undefined) {
        if (kalshiBetted > polyBetted) {
          return 'buy_poly_up_kalshi_down';
        } else if (kalshiBetted < polyBetted) {
          return 'buy_poly_down_kalshi_up';
        } else {
          // If betted prices are equal, choose the more profitable option
          const cost1 = poly.upPrice + kalshi.downPrice;
          const cost2 = poly.downPrice + kalshi.upPrice;
          return cost1 < cost2 ? 'buy_poly_up_kalshi_down' : 'buy_poly_down_kalshi_up';
        }
      } else {
        // If betted prices not available, choose the more profitable option
        const cost1 = poly.upPrice + kalshi.downPrice;
        const cost2 = poly.downPrice + kalshi.upPrice;
        return cost1 < cost2 ? 'buy_poly_up_kalshi_down' : 'buy_poly_down_kalshi_up';
      }
    }

    // Case 2: Only poly_up + kalshi_down < 90
    if (hasPolyUpKalshiDown) {
      // Require betted prices for this decision
      if (polyBetted !== undefined && kalshiBetted !== undefined) {
        if (polyBetted < kalshiBetted) {
          return 'buy_poly_up_kalshi_down';
        } else {
          return 'skip'; // polyBetted >= kalshiBetted
        }
      } else {
        // If betted prices not available, skip to avoid risk
        return 'skip';
      }
    }

    // Case 3: Only poly_down + kalshi_up < 90
    if (hasPolyDownKalshiUp) {
      // Require betted prices for this decision
      if (polyBetted !== undefined && kalshiBetted !== undefined) {
        if (polyBetted > kalshiBetted) {
          return 'buy_poly_down_kalshi_up';
        } else {
          return 'skip'; // polyBetted <= kalshiBetted
        }
      } else {
        // If betted prices not available, skip to avoid risk
        return 'skip';
      }
    }

    return 'skip';
  }

  /**
   * Validates if an opportunity is still valid (prices haven't changed significantly)
   */
  validateOpportunity(
    opportunity: ArbitrageOpportunity,
    currentPoly: MarketPrice,
    currentKalshi: MarketPrice
  ): boolean {
    const priceChangeThreshold = 2; // Allow 2% price change
    
    const polyUpDiff = Math.abs(currentPoly.upPrice - opportunity.polyUpPrice);
    const polyDownDiff = Math.abs(currentPoly.downPrice - opportunity.polyDownPrice);
    const kalshiUpDiff = Math.abs(currentKalshi.upPrice - opportunity.kalshiUpPrice);
    const kalshiDownDiff = Math.abs(currentKalshi.downPrice - opportunity.kalshiDownPrice);

    return polyUpDiff < priceChangeThreshold &&
           polyDownDiff < priceChangeThreshold &&
           kalshiUpDiff < priceChangeThreshold &&
           kalshiDownDiff < priceChangeThreshold;
  }
}
