/**
 * Trading Execution Logic
 * Handles executing trades based on arbitrage opportunities
 */

import { ArbitrageOpportunity, Trade, Position } from '../types/market';
import { PolymarketClient } from '../clients/polymarket';
import { KalshiClient } from '../clients/kalshi';

export class Trader {
  private polymarket: PolymarketClient;
  private kalshi: KalshiClient;
  private minTradeAmount: number;
  private maxTradeAmount: number;

  constructor(polymarket: PolymarketClient, kalshi: KalshiClient) {
    this.polymarket = polymarket;
    this.kalshi = kalshi;
    this.minTradeAmount = parseFloat(process.env.MIN_TRADE_AMOUNT || '10');
    this.maxTradeAmount = parseFloat(process.env.MAX_TRADE_AMOUNT || '1000');
  }

  /**
   * Executes trades based on arbitrage opportunity
   */
  async executeArbitrage(opportunity: ArbitrageOpportunity, amount: number): Promise<Position | null> {
    // Validate trade amount
    if (amount < this.minTradeAmount || amount > this.maxTradeAmount) {
      console.warn(`[Trader] Trade amount ${amount} is outside allowed range`);
      return null;
    }

    try {
      let polyTrade: Trade | null = null;
      let kalshiTrade: Trade | null = null;

      // Execute trades based on action
      if (opportunity.action === 'buy_poly_up_kalshi_down') {
        // Buy Polymarket UP and Kalshi DOWN
        const [polyResult, kalshiResult] = await Promise.allSettled([
          this.polymarket.buyToken(
            opportunity.marketId,
            'YES',
            amount,
            opportunity.polyUpPrice
          ),
          this.kalshi.buyToken(
            opportunity.marketId,
            'no',
            amount,
            opportunity.kalshiDownPrice
          ),
        ]);

        if (polyResult.status === 'fulfilled') polyTrade = polyResult.value;
        if (kalshiResult.status === 'fulfilled') kalshiTrade = kalshiResult.value;

      } else if (opportunity.action === 'buy_poly_down_kalshi_up') {
        // Buy Polymarket DOWN and Kalshi UP
        const [polyResult, kalshiResult] = await Promise.allSettled([
          this.polymarket.buyToken(
            opportunity.marketId,
            'NO',
            amount,
            opportunity.polyDownPrice
          ),
          this.kalshi.buyToken(
            opportunity.marketId,
            'yes',
            amount,
            opportunity.kalshiUpPrice
          ),
        ]);

        if (polyResult.status === 'fulfilled') polyTrade = polyResult.value;
        if (kalshiResult.status === 'fulfilled') kalshiTrade = kalshiResult.value;
      }

      // Check if both trades succeeded
      if (!polyTrade || !kalshiTrade) {
        console.error(`[Trader] Failed to execute both trades for market ${opportunity.marketId}`);
        return null;
      }

      // Create position record
      const position: Position = {
        marketId: opportunity.marketId,
        polyUp: opportunity.action === 'buy_poly_up_kalshi_down' ? amount : 0,
        polyDown: opportunity.action === 'buy_poly_down_kalshi_up' ? amount : 0,
        kalshiUp: opportunity.action === 'buy_poly_down_kalshi_up' ? amount : 0,
        kalshiDown: opportunity.action === 'buy_poly_up_kalshi_down' ? amount : 0,
        totalCost: opportunity.totalCost * amount / 100,
        expectedProfit: opportunity.profitPotential * amount / 100,
        status: 'active',
      };

      console.log(`[Trader] Successfully executed arbitrage for market ${opportunity.marketId}`);
      return position;

    } catch (error) {
      console.error(`[Trader] Error executing arbitrage:`, error);
      return null;
    }
  }

  /**
   * Calculates optimal trade amount based on available balance and risk management
   */
  calculateTradeAmount(opportunity: ArbitrageOpportunity, availableBalance: number): number {
    // Use a percentage of available balance, capped by max trade amount
    const percentage = parseFloat(process.env.TRADE_PERCENTAGE || '0.1'); // 10% by default
    const calculatedAmount = availableBalance * percentage;
    
    return Math.min(
      Math.max(calculatedAmount, this.minTradeAmount),
      this.maxTradeAmount
    );
  }
}
