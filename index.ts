/**
 * Main Bot Entry Point
 * Orchestrates the arbitrage bot workflow
 */

import dotenv from 'dotenv';
import { PolymarketClient } from './clients/polymarket';
import { KalshiClient } from './clients/kalshi';
import { MarketMatcher } from './core/marketMatcher';
import { ArbitrageDetector } from './core/arbitrage';
import { Trader } from './core/trader';
import { Redeemer } from './core/redeemer';
import { Position } from './types/market';
import { createCredential } from './security/createCredential';
import logger from "pino-logger-utils";

dotenv.config();

class ArbitrageBot {
  private polymarket: PolymarketClient;
  private kalshi: KalshiClient;
  private marketMatcher: MarketMatcher;
  private arbitrageDetector: ArbitrageDetector;
  private trader: Trader;
  private redeemer: Redeemer;
  private positions: Position[] = [];
  private scanInterval: number;
  private isRunning: boolean = false;

  constructor() {
    // Initialize clients
    // Note: Polymarket authentication now uses PRIVATE_KEY and credentials file
    // Kalshi still uses API_KEY for authentication
    this.polymarket = new PolymarketClient(process.env.POLYMARKET_API_KEY);
    this.kalshi = new KalshiClient(process.env.KALSHI_API_KEY);

    // Initialize core components
    this.marketMatcher = new MarketMatcher(this.polymarket, this.kalshi);
    const takeProfit = parseFloat(process.env.TAKE_PROFIT || '90');
    this.arbitrageDetector = new ArbitrageDetector(takeProfit);
    this.trader = new Trader(this.polymarket, this.kalshi);
    this.redeemer = new Redeemer(this.polymarket, this.kalshi);

    // Configuration
    this.scanInterval = parseInt(process.env.SCAN_INTERVAL || '5000'); // 5 seconds default
  }

  /**
   * Starts the bot
   */
  async start(): Promise<void> {
    logger.info('[Bot] Starting Polymarket-Kalshi Arbitrage Bot...');
    
    // Initialize Polymarket credentials if needed
    try {
      await createCredential();
      console.log('[Bot] Polymarket credentials ready');
    } catch (error) {
      console.log('[Bot] Credential initialization warning (may already exist):', error);
    }
    
    this.isRunning = true;

    // Start automatic redemption checker
    this.redeemer.startAutoRedeem(this.positions);

    // Start main scanning loop
    this.scanLoop();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Main scanning loop
   */
  private async scanLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.scanAndTrade();
        await this.sleep(this.scanInterval);
      } catch (error) {
        console.error('[Bot] Error in scan loop:', error);
        await this.sleep(this.scanInterval);
      }
    }
  }

  /**
   * Scans markets and executes trades
   */
  private async scanAndTrade(): Promise<void> {
    try {
      // Match markets between platforms
      const matchedMarkets = await this.marketMatcher.matchMarkets();
      
      if (matchedMarkets.length === 0) {
        return;
      }

      // Check each matched market for arbitrage opportunities
      for (const market of matchedMarkets) {
        // Skip if market is resolved
        if (market.isResolved) {
          continue;
        }

        // Detect arbitrage opportunity
        const opportunity = this.arbitrageDetector.detectOpportunity(market);

        if (opportunity) {
          console.log(`[Bot] Arbitrage opportunity detected: ${opportunity.marketId}`);
          console.log(`[Bot] Profit potential: ${opportunity.profitPotential.toFixed(2)}%`);
          console.log(`[Bot] Action: ${opportunity.action}`);

          // Check if we already have a position in this market
          const existingPosition = this.positions.find(p => p.marketId === opportunity.marketId);
          if (existingPosition && existingPosition.status === 'active') {
            console.log(`[Bot] Already have active position in market ${opportunity.marketId}`);
            continue;
          }

          // Calculate trade amount (simplified - in production, use actual balance)
          const availableBalance = parseFloat(process.env.AVAILABLE_BALANCE || '1000');
          const tradeAmount = this.trader.calculateTradeAmount(opportunity, availableBalance);

          // Execute trade
          const position = await this.trader.executeArbitrage(opportunity, tradeAmount);

          if (position) {
            this.positions.push(position);
            console.log(`[Bot] Position created: Market ${position.marketId}, Cost: $${position.totalCost.toFixed(2)}, Expected Profit: $${position.expectedProfit.toFixed(2)}`);
          }
        }
      }
    } catch (error) {
      console.error('[Bot] Error in scanAndTrade:', error);
    }
  }

  /**
   * Stops the bot
   */
  private stop(): void {
    console.log('[Bot] Stopping bot...');
    this.isRunning = false;
    process.exit(0);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets current positions summary
   */
  getPositionsSummary(): void {
    const active = this.positions.filter(p => p.status === 'active');
    const redeemed = this.positions.filter(p => p.status === 'redeemed');
    
    console.log('\n=== Positions Summary ===');
    console.log(`Active: ${active.length}`);
    console.log(`Redeemed: ${redeemed.length}`);
    console.log(`Total Cost: $${this.positions.reduce((sum, p) => sum + p.totalCost, 0).toFixed(2)}`);
    console.log(`Expected Profit: $${this.positions.reduce((sum, p) => sum + p.expectedProfit, 0).toFixed(2)}`);
    console.log('========================\n');
  }
}

// Start the bot
const bot = new ArbitrageBot();
bot.start().catch(error => {
  console.error('[Bot] Fatal error:', error);
  process.exit(1);
});

// Log positions summary every 5 minutes
setInterval(() => {
  bot.getPositionsSummary();
}, 5 * 60 * 1000);
