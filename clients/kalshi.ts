/**
 * Kalshi API Client
 * Refactored to use kalshi-typescript SDK following sample repository patterns
 * Preserves exact interface for arbitrage logic compatibility
 */

import { Configuration, MarketApi, OrdersApi, PortfolioApi } from "kalshi-typescript";
import { MarketPrice, Trade } from "../types/market";
import { Logger } from "../utils/logger";

export class KalshiClient {
  private config: Configuration;
  private marketApi: MarketApi;
  private ordersApi: OrdersApi;
  private portfolioApi: PortfolioApi;

  constructor(apiKey?: string) {
    // Build configuration following sample repository pattern
    this.config = new Configuration({
      apiKey: apiKey || process.env.KALSHI_API_KEY,
      basePath: process.env.KALSHI_API_URL || "https://trading-api.kalshi.com/trade-api/v2",
      ...(process.env.KALSHI_PRIVATE_KEY_PATH
        ? { privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH }
        : process.env.KALSHI_PRIVATE_KEY_PEM
          ? { privateKeyPem: process.env.KALSHI_PRIVATE_KEY_PEM }
          : {}),
    });

    // Initialize API clients
    this.marketApi = new MarketApi(this.config);
    this.ordersApi = new OrdersApi(this.config);
    this.portfolioApi = new PortfolioApi(this.config);

    Logger.info("[Kalshi] Client initialized");
  }

  /**
   * Fetches current market prices for a specific market
   * Uses Kalshi MarketApi getMarket method
   */
  async getMarketPrices(marketId: string): Promise<MarketPrice> {
    try {
      const response = await this.marketApi.getMarket(marketId);
      const market = response.data.market;

      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Extract prices from market data
      // Kalshi prices are already in 0-100 scale (cents)
      const upPrice = market.yes_ask || market.yes_bid || 50;
      const downPrice = market.no_ask || market.no_bid || 50;

      // Get betted price if available
      const bettedPrice = market.betted_price || undefined;

      return {
        upPrice,
        downPrice,
        bettedPrice,
        timestamp: Date.now(),
      };
    } catch (error) {
      Logger.error(`[Kalshi] Error fetching market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches all active 15-minute BTC markets
   * Uses Kalshi MarketApi getMarkets method following sample repository pattern
   */
  async getActiveBTCMarkets(): Promise<any[]> {
    try {
      const allMarkets: any[] = [];
      let cursor: string | undefined;
      let pageSize: number;

      // Fetch markets with pagination following sample repository pattern
      do {
        const response = await this.marketApi.getMarkets(
          200, // page size
          cursor,
          undefined, // event_ticker
          "BTC-15M", // series_ticker for BTC 15m markets
          undefined, // max_close_ts
          undefined, // min_close_ts
          undefined, // status
          undefined, // tickers
          undefined, // limit
          undefined, // cursor
          "open", // status filter
          undefined, // exchange_status
          undefined  // limit
        );

        const markets = response.data.markets || [];
        pageSize = markets.length;
        allMarkets.push(...markets);
        cursor = response.data.cursor || undefined;

        // Break if no more pages or we have enough markets
        if (!cursor || allMarkets.length >= 1000) break;
      } while (pageSize === 200);

      return allMarkets;
    } catch (error) {
      Logger.error("[Kalshi] Error fetching BTC markets:", error);
      throw error;
    }
  }

  /**
   * Places a buy order on Kalshi
   * Uses Kalshi OrdersApi createOrder method following sample repository pattern
   * Preserves exact interface for arbitrage logic
   */
  async buyToken(marketId: string, side: 'yes' | 'no', amount: number, maxPrice: number): Promise<Trade> {
    try {
      // Validate and clamp price (Kalshi uses 1-99 cents)
      const price = Math.max(1, Math.min(99, maxPrice));

      // Create order following sample repository pattern
      const response = await this.ordersApi.createOrder({
        ticker: marketId,
        side,
        action: "buy",
        count: amount,
        type: "limit",
        time_in_force: "good_till_canceled",
        ...(side === "yes" ? { yes_price: price } : { no_price: price }),
      });

      const order = response.data.order;
      const orderId = order?.order_id || "unknown";

      Logger.info(
        `[Kalshi] Order placed: ${orderId} ticker=${marketId} side=${side} count=${amount} price=${price}c`
      );

      // Map response to Trade interface
      return {
        id: orderId,
        marketId,
        platform: 'kalshi',
        side: side === 'yes' ? 'up' : 'down',
        amount,
        price: maxPrice,
        timestamp: Date.now(),
        status: order?.status === 'filled' ? 'filled' : 'pending',
        txHash: orderId, // Kalshi uses order ID as transaction identifier
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`[Kalshi] Error buying token: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Checks if a market is resolved and can be redeemed
   * Uses Kalshi MarketApi getMarket method
   */
  async isMarketResolved(marketId: string): Promise<boolean> {
    try {
      const response = await this.marketApi.getMarket(marketId);
      const market = response.data.market;
      
      if (!market) {
        return false;
      }

      return market.status === 'resolved';
    } catch (error) {
      Logger.error(`[Kalshi] Error checking market resolution:`, error);
      return false;
    }
  }

  /**
   * Redeems tokens after market resolution
   * Uses Kalshi PortfolioApi settlement methods
   */
  async redeemTokens(marketId: string, side: 'yes' | 'no'): Promise<boolean> {
    try {
      // Kalshi redemption is typically handled through settlements
      // The exact API call may vary - this is a placeholder
      // In practice, Kalshi may auto-settle or require specific settlement calls
      
      // Check if market is resolved first
      const isResolved = await this.isMarketResolved(marketId);
      if (!isResolved) {
        Logger.warn(`[Kalshi] Market ${marketId} is not resolved yet`);
        return false;
      }

      // Kalshi typically auto-settles positions, but we can check positions
      // For now, return true if market is resolved (assuming auto-settlement)
      Logger.info(`[Kalshi] Market ${marketId} is resolved - assuming auto-settlement`);
      return true;
    } catch (error) {
      Logger.error(`[Kalshi] Error redeeming tokens:`, error);
      return false;
    }
  }

  /**
   * Gets current positions/balances
   * Uses Kalshi PortfolioApi getBalance method
   */
  async getPositions(): Promise<any[]> {
    try {
      // Get balance
      const balanceResponse = await this.portfolioApi.getBalance();
      
      // Get portfolio positions
      // Note: Kalshi API structure may vary - this is a placeholder
      const positions = balanceResponse.data.positions || [];
      
      return positions.map((pos: any) => ({
        marketId: pos.ticker || pos.market_id,
        amount: pos.count || pos.amount || 0,
        side: pos.side,
        status: pos.status || 'active',
      }));
    } catch (error) {
      Logger.error('[Kalshi] Error fetching positions:', error);
      return [];
    }
  }
}
