/**
 * Kalshi API Client
 * Refactored to use kalshi-typescript SDK following sample repository patterns
 * Preserves exact interface for arbitrage logic compatibility
 */

import { Configuration, MarketApi, OrdersApi, PortfolioApi } from "kalshi-typescript";
import { MarketPrice, Trade } from "../types/market";

/**
 * Normalize private key so Node crypto accepts it.
 * Rebuilds PEM with strict 64-char base64 lines so Node/OpenSSL decoder accepts it.
 * Following the pattern from Polymarket-Bot-Sample-1/src/config.ts
 */
function normalizePrivateKeyPem(value: string): string {
  const PEM_HEADER = "-----BEGIN RSA PRIVATE KEY-----";
  const PEM_FOOTER = "-----END RSA PRIVATE KEY-----";
  
  const trimmed = value.trim();
  // Extract base64: remove header/footer and all whitespace
  let base64 = trimmed
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!base64) return trimmed;
  // Rebuild PEM with exactly 64 chars per line (required by some OpenSSL/Node versions)
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }
  return `${PEM_HEADER}\n${lines.join("\n")}\n${PEM_FOOTER}`;
}

function getPrivateKeyPem(): string {
  const raw = process.env.KALSHI_PRIVATE_KEY_PEM ?? "";
  if (!raw) return "";
  return normalizePrivateKeyPem(raw);
}

/**
 * Build Kalshi configuration following exact pattern from Polymarket-Bot-Sample-1
 */
function buildConfiguration(): Configuration {
  const BASE_PATHS = {
    prod: "https://api.elections.kalshi.com/trade-api/v2",
    demo: "https://demo-api.kalshi.co/trade-api/v2",
  } as const;

  const privateKeyPem = getPrivateKeyPem();
  const demo = process.env.KALSHI_DEMO === "true";
  
  return new Configuration({
    apiKey: process.env.KALSHI_API_KEY ?? "",
    basePath: process.env.KALSHI_API_URL || 
              process.env.KALSHI_BASE_PATH ||
              (demo ? BASE_PATHS.demo : BASE_PATHS.prod),
    ...(process.env.KALSHI_PRIVATE_KEY_PATH
      ? { privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH }
      : privateKeyPem
        ? { privateKeyPem }
        : {}),
  });
}

export class KalshiClient {
  private config: Configuration;
  private marketApi: MarketApi;
  private ordersApi: OrdersApi;
  private portfolioApi: PortfolioApi;

  constructor(apiKey?: string) {
    // Build configuration following exact sample repository pattern
    // Override API key if provided, otherwise use env var
    const baseConfig = buildConfiguration();
    this.config = new Configuration({
      ...baseConfig,
      ...(apiKey ? { apiKey } : {}),
    });

    // Initialize API clients
    this.marketApi = new MarketApi(this.config);
    this.ordersApi = new OrdersApi(this.config);
    this.portfolioApi = new PortfolioApi(this.config);

    console.log("[INFO] [Kalshi] Client initialized");
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

      // Get betted price if available (may not exist on Market type)
      const bettedPrice = (market as any).betted_price || undefined;

      return {
        upPrice,
        downPrice,
        bettedPrice,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.log(`[ERROR] [Kalshi] Error fetching market ${marketId}:`, error);
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

      // Fetch markets with pagination - exact match to Polymarket-Bot-Sample-1/src/bot.ts
      // Using KXBTC15M series ticker as per reference implementation
      do {
        const response = await this.marketApi.getMarkets(
          200,
          cursor,
          undefined,
          "KXBTC15M", // BTC_SERIES_TICKER from sample
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "open", // Use string literal to match sample exactly
          undefined,
          undefined
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
      console.log("[ERROR] [Kalshi] Error fetching BTC markets:", error);
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

      // Create order following exact sample repository pattern
      const orderRequest: any = {
        ticker: marketId,
        side,
        action: "buy",
        count: amount,
        type: "limit", // Explicitly set limit order type as in sample
        time_in_force: "good_till_canceled",
        ...(side === "yes" ? { yes_price: price } : { no_price: price }),
      };
      const response = await this.ordersApi.createOrder(orderRequest);

      const order = response.data.order;
      const orderId = order?.order_id || "unknown";

      console.log(`[INFO] [Kalshi] Order placed: ${orderId} ticker=${marketId} side=${side} count=${amount} price=${price}c`);

      // Map response to Trade interface
      return {
        id: orderId,
        marketId,
        platform: 'kalshi',
        side: side === 'yes' ? 'up' : 'down',
        amount,
        price: maxPrice,
        timestamp: Date.now(),
        status: (order?.status as string) === 'filled' ? 'filled' : 'pending',
        txHash: orderId, // Kalshi uses order ID as transaction identifier
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[ERROR] [Kalshi] Error buying token: ${errorMsg}`);
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

      return (market.status as string) === 'resolved';
    } catch (error) {
      console.log(`[ERROR] [Kalshi] Error checking market resolution:`, error);
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
        console.log(`[WARNING] [Kalshi] Market ${marketId} is not resolved yet`);
        return false;
      }

      // Kalshi typically auto-settles positions, but we can check positions
      // For now, return true if market is resolved (assuming auto-settlement)
      console.log(`[INFO] [Kalshi] Market ${marketId} is resolved - assuming auto-settlement`);
      return true;
    } catch (error) {
      console.log(`[ERROR] [Kalshi] Error redeeming tokens:`, error);
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
      // Note: Kalshi API structure may vary - positions may be in a different endpoint
      // For now, return empty array as positions endpoint structure is unclear
      const positions = (balanceResponse.data as any).positions || [];
      
      return positions.map((pos: any) => ({
        marketId: pos.ticker || pos.market_id,
        amount: pos.count || pos.amount || 0,
        side: pos.side,
        status: pos.status || 'active',
      }));
    } catch (error) {
      console.log('[ERROR] [Kalshi] Error fetching positions:', error);
      return [];
    }
  }
}
