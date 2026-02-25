/**
 * Redeem Logic
 * Handles automatic redemption of tokens after market resolution
 */

import { Position } from '../types/market';
import { PolymarketClient } from '../clients/polymarket';
import { KalshiClient } from '../clients/kalshi';

export class Redeemer {
  private polymarket: PolymarketClient;
  private kalshi: KalshiClient;
  private checkInterval: number; // milliseconds

  constructor(polymarket: PolymarketClient, kalshi: KalshiClient) {
    this.polymarket = polymarket;
    this.kalshi = kalshi;
    this.checkInterval = parseInt(process.env.REDEEM_CHECK_INTERVAL || '60000'); // 1 minute default
  }

  /**
   * Checks and redeems all active positions
   */
  async checkAndRedeem(positions: Position[]): Promise<void> {
    for (const position of positions) {
      if (position.status !== 'active') {
        continue;
      }

      try {
        // Check if market is resolved on both platforms
        const [polyResolved, kalshiResolved] = await Promise.all([
          this.polymarket.isMarketResolved(position.marketId),
          this.kalshi.isMarketResolved(position.marketId),
        ]);

        if (polyResolved && kalshiResolved) {
          await this.redeemPosition(position);
        }
      } catch (error) {
        console.error(`[Redeemer] Error checking position ${position.marketId}:`, error);
      }
    }
  }

  /**
   * Redeems a specific position
   */
  private async redeemPosition(position: Position): Promise<void> {
    try {
      const promises: Promise<boolean>[] = [];

      // Redeem Polymarket tokens
      if (position.polyUp > 0) {
        promises.push(this.polymarket.redeemTokens(position.marketId, 'YES'));
      }
      if (position.polyDown > 0) {
        promises.push(this.polymarket.redeemTokens(position.marketId, 'NO'));
      }

      // Redeem Kalshi tokens
      if (position.kalshiUp > 0) {
        promises.push(this.kalshi.redeemTokens(position.marketId, 'yes'));
      }
      if (position.kalshiDown > 0) {
        promises.push(this.kalshi.redeemTokens(position.marketId, 'no'));
      }

      const results = await Promise.allSettled(promises);
      const allSucceeded = results.every(r => r.status === 'fulfilled' && r.value === true);

      if (allSucceeded) {
        position.status = 'redeemed';
        console.log(`[Redeemer] Successfully redeemed position for market ${position.marketId}`);
      } else {
        console.error(`[Redeemer] Failed to redeem some tokens for market ${position.marketId}`);
      }
    } catch (error) {
      console.error(`[Redeemer] Error redeeming position:`, error);
    }
  }

  /**
   * Starts the automatic redemption checker
   */
  startAutoRedeem(positions: Position[]): NodeJS.Timeout {
    return setInterval(async () => {
      await this.checkAndRedeem(positions);
    }, this.checkInterval);
  }
}
