/**
 * Polymarket API Client
 * Refactored to use @polymarket/clob-client following sample repository patterns
 * Preserves exact interface for arbitrage logic compatibility
 */

import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import type { UserMarketOrder, CreateOrderOptions } from "@polymarket/clob-client";
import { getClobClient } from "../providers/clobclient";
import { MarketPrice, Trade } from "../types/market";
import { Logger } from "../utils/logger";

export class PolymarketClient {
  private client: ClobClient | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(_apiKey?: string) {
    // API key parameter kept for interface compatibility but not used
    // Authentication is handled via PRIVATE_KEY and credentials file
    this.initializeClient();
  }

  /**
   * Initialize CLOB client (lazy initialization)
   */
  private async initializeClient(): Promise<void> {
    if (this.client) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        this.client = await getClobClient();
        Logger.info("[Polymarket] CLOB client initialized");
      } catch (error) {
        Logger.error("[Polymarket] Failed to initialize CLOB client", error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Ensure client is initialized
   */
  private async ensureClient(): Promise<ClobClient> {
    await this.initializeClient();
    if (!this.client) {
      throw new Error("CLOB client not initialized");
    }
    return this.client;
  }

  /**
   * Fetches current market prices for a specific market
   * Uses CLOB client getOrderBook method
   */
  async getMarketPrices(marketId: string): Promise<MarketPrice> {
    try {
      const client = await this.ensureClient();
      
      // Get order book for the market
      // Note: CLOB client uses token IDs, so we need to get the market info first
      // For now, we'll use the marketId directly as it might be a condition ID
      const orderBook = await client.getOrderBook(marketId);

      // Extract best bid/ask prices from order book
      const bids = orderBook.bids || [];
      const asks = orderBook.asks || [];

      // Filter for YES (up) and NO (down) outcomes
      // CLOB uses token IDs, so we need to identify YES/NO tokens
      // For simplicity, we'll use the first two tokens if available
      const yesAsks = asks.filter((a: any) => a.side === Side.BUY || a.outcome === "YES");
      const noAsks = asks.filter((a: any) => a.side === Side.BUY || a.outcome === "NO");
      
      // Get best ask prices (lowest ask = best buy price)
      // Prices in CLOB are in 0-1 range, convert to 0-100
      const upPrice = yesAsks.length > 0 
        ? parseFloat(yesAsks[0].price || "0.5") * 100 
        : 50;
      const downPrice = noAsks.length > 0 
        ? parseFloat(noAsks[0].price || "0.5") * 100 
        : 50;

      // Get betted price if market is resolved
      // This might need to come from market info, not order book
      const bettedPrice = orderBook.bettedPrice 
        ? parseFloat(orderBook.bettedPrice) * 100 
        : undefined;

      return {
        upPrice,
        downPrice,
        bettedPrice,
        timestamp: Date.now(),
      };
    } catch (error) {
      Logger.error(`[Polymarket] Error fetching market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches all active 15-minute BTC markets
   * Uses CLOB client getMarkets method
   */
  async getActiveBTCMarkets(): Promise<any[]> {
    try {
      const client = await this.ensureClient();
      
      // Get markets using CLOB client
      // Note: CLOB API might have different filtering options
      const markets = await client.getMarkets({
        active: true,
        // Additional filters may be needed based on CLOB API
      });

      // Filter for BTC 15m markets
      // This filtering logic should match the original arbitrage logic expectations
      const btcMarkets = markets.filter((market: any) => {
        const title = (market.question || market.title || "").toLowerCase();
        const slug = (market.slug || "").toLowerCase();
        return (title.includes("btc") || slug.includes("btc")) && 
               (title.includes("15m") || slug.includes("15m"));
      });

      return btcMarkets;
    } catch (error) {
      Logger.error("[Polymarket] Error fetching BTC markets:", error);
      throw error;
    }
  }

  /**
   * Places a buy order on Polymarket
   * Uses CLOB client createAndPostMarketOrder method
   * Preserves exact interface for arbitrage logic
   */
  async buyToken(marketId: string, outcome: 'YES' | 'NO', amount: number, maxPrice: number): Promise<Trade> {
    try {
      const client = await this.ensureClient();

      // Get market info to find the correct token ID
      const markets = await client.getMarkets({});
      const market = markets.find((m: any) => m.conditionId === marketId || m.id === marketId);
      
      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Determine token ID based on outcome
      // CLOB uses token IDs for YES/NO outcomes
      // We need to get the token ID from the market structure
      let tokenId: string;
      if (outcome === 'YES') {
        // YES token is typically the first outcome token
        tokenId = market.outcomeTokens?.[0] || market.tokens?.[0] || marketId;
      } else {
        // NO token is typically the second outcome token
        tokenId = market.outcomeTokens?.[1] || market.tokens?.[1] || marketId;
      }

      // Create market order
      // amount is in USDC for BUY orders
      // maxPrice is in 0-100 range, convert to 0-1 for CLOB
      const marketOrder: UserMarketOrder = {
        tokenID: tokenId,
        side: Side.BUY,
        amount: amount, // USDC amount
        orderType: OrderType.FAK, // Fill or Kill
        price: maxPrice / 100, // Convert to 0-1 range
      };

      const orderOptions: Partial<CreateOrderOptions> = {
        tickSize: "0.01",
        negRisk: false,
      };

      // Place the order
      const response = await client.createAndPostMarketOrder(
        marketOrder,
        orderOptions,
        OrderType.FAK
      );

      // Map response to Trade interface
      return {
        id: response.orderID || "unknown",
        marketId,
        platform: 'polymarket',
        side: outcome === 'YES' ? 'up' : 'down',
        amount,
        price: maxPrice,
        timestamp: Date.now(),
        status: response.status === 'FILLED' || response.status === 'PARTIALLY_FILLED' ? 'filled' : 'pending',
        txHash: response.transactionsHashes?.[0],
      };
    } catch (error) {
      Logger.error(`[Polymarket] Error buying token:`, error);
      throw error;
    }
  }

  /**
   * Checks if a market is resolved and can be redeemed
   * Uses CLOB client getMarket method
   */
  async isMarketResolved(marketId: string): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      
      // Get market info
      const markets = await client.getMarkets({});
      const market = markets.find((m: any) => m.conditionId === marketId || m.id === marketId);
      
      if (!market) {
        return false;
      }

      // Check if market is resolved
      return market.resolved || market.status === 'resolved';
    } catch (error) {
      Logger.error(`[Polymarket] Error checking market resolution:`, error);
      return false;
    }
  }

  /**
   * Redeems tokens after market resolution
   * Uses CLOB client redemption methods
   */
  async redeemTokens(marketId: string, outcome: 'YES' | 'NO'): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      
      // Get market info to find token ID
      const markets = await client.getMarkets({});
      const market = markets.find((m: any) => m.conditionId === marketId || m.id === marketId);
      
      if (!market) {
        Logger.error(`[Polymarket] Market ${marketId} not found for redemption`);
        return false;
      }

      // Determine token ID
      let tokenId: string;
      if (outcome === 'YES') {
        tokenId = market.outcomeTokens?.[0] || market.tokens?.[0] || marketId;
      } else {
        tokenId = market.outcomeTokens?.[1] || market.tokens?.[1] || marketId;
      }

      // Redeem tokens using CLOB client
      // Note: CLOB client might have a specific redemption method
      // This is a placeholder - actual redemption might require different API calls
      const result = await client.redeemPosition({
        tokenId,
        // Additional redemption parameters may be needed
      });

      return result !== null;
    } catch (error) {
      Logger.error(`[Polymarket] Error redeeming tokens:`, error);
      return false;
    }
  }

  /**
   * Gets current positions/balances
   * Uses CLOB client getBalanceAllowance method
   */
  async getPositions(): Promise<any[]> {
    try {
      const client = await this.ensureClient();
      
      // Get balance and positions
      const balance = await client.getBalanceAllowance({
        asset_type: AssetType.CONDITIONAL,
      });

      // Get open positions/orders
      const openOrders = await client.getOpenOrders();
      
      // Map to positions format expected by arbitrage logic
      return openOrders.map((order: any) => ({
        marketId: order.marketId || order.conditionId,
        amount: parseFloat(order.size || "0"),
        side: order.side,
        status: order.status,
      }));
    } catch (error) {
      Logger.error('[Polymarket] Error fetching positions:', error);
      return [];
    }
  }
}
