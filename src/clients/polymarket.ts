/**
 * Polymarket API Client
 * Refactored to use @polymarket/clob-client following sample repository patterns
 * Preserves exact interface for arbitrage logic compatibility
 */

import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import type { UserMarketOrder, CreateOrderOptions } from "@polymarket/clob-client";
import { getClobClient } from "../providers/clobclient";
import { MarketPrice, Trade } from "../types/market";

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
        console.log("[INFO] [Polymarket] CLOB client initialized");
      } catch (error) {
        console.log("[ERROR] [Polymarket] Failed to initialize CLOB client", error);
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
   * Uses CLOB client getMarket and getMidpoint methods
   */
  async getMarketPrices(marketId: string): Promise<MarketPrice> {
    try {
      const client = await this.ensureClient();
      
      // Get market info to find token IDs
      const market = await client.getMarket(marketId);
      
      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Get token IDs for YES and NO outcomes
      // For binary markets, typically first token is YES, second is NO
      const upTokenId = market.tokens?.[0]?.token_id || market.outcomeTokens?.[0];
      const downTokenId = market.tokens?.[1]?.token_id || market.outcomeTokens?.[1];

      if (!upTokenId || !downTokenId) {
        throw new Error(`Could not find token IDs for market ${marketId}`);
      }

      // Get midpoint prices for both tokens
      const [upMidpoint, downMidpoint] = await Promise.all([
        client.getMidpoint(upTokenId),
        client.getMidpoint(downTokenId),
      ]);

      // Prices in CLOB are in 0-1 range, convert to 0-100
      const upPrice = parseFloat(upMidpoint.mid || "0.5") * 100;
      const downPrice = parseFloat(downMidpoint.mid || "0.5") * 100;

      // Get betted price from market if resolved
      const bettedPrice = market.bettedPrice 
        ? parseFloat(market.bettedPrice) * 100 
        : undefined;

      return {
        upPrice,
        downPrice,
        bettedPrice,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.log(`[ERROR] [Polymarket] Error fetching market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches all active 15-minute BTC markets
   * Uses CLOB client getMarkets method (data-api endpoint returns 404)
   */
  async getActiveBTCMarkets(): Promise<any[]> {
    try {
      const client = await this.ensureClient();
      const allMarkets: any[] = [];
      let cursor: string | undefined;
      let pageSize: number = 0;
      const maxMarkets = 1000; // Limit to prevent excessive API calls

      console.log("[INFO] [Polymarket] Fetching markets using CLOB client...");

      // Use CLOB client's getMarkets method with pagination
      do {
        try {
          const response = await client.getMarkets(cursor);
          
          // Extract markets from response
          // PaginationPayload structure: { data: Market[], next_cursor?: string }
          const markets = response.data || [];
          pageSize = markets.length;
          allMarkets.push(...markets);
          
          // Get next cursor for pagination
          cursor = response.next_cursor || undefined;

          console.log(`[INFO] [Polymarket] Fetched ${markets.length} markets (total: ${allMarkets.length})`);

          // Break if no more pages or we have enough markets
          if (!cursor || allMarkets.length >= maxMarkets) break;
        } catch (fetchError) {
          const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.log(`[ERROR] [Polymarket] Error fetching markets:`, errorMsg);
          // If we have some markets, return what we have
          if (allMarkets.length > 0) {
            console.log(`[WARNING] [Polymarket] Returning ${allMarkets.length} markets despite error`);
            break;
          }
          throw fetchError;
        }
      } while (cursor && allMarkets.length < maxMarkets);

      console.log(`[INFO] [Polymarket] Fetched ${allMarkets.length} total markets`);

      // Filter for BTC 15m markets with improved matching
      const btcMarkets = allMarkets.filter((market: any) => {
        // CLOB client returns markets with different structure
        const question = (market.question || market.title || market.conditionId || "").toLowerCase();
        const description = (market.description || "").toLowerCase();
        const conditionId = (market.conditionId || "").toLowerCase();
        
        // Check for BTC/Bitcoin references
        const hasBTC = question.includes("btc") || 
                      question.includes("bitcoin") || 
                      description.includes("btc") ||
                      description.includes("bitcoin") ||
                      conditionId.includes("btc");
        
        // Check for 15m/15-minute references
        const has15m = question.includes("15m") || 
                      question.includes("15-minute") || 
                      question.includes("15 min") ||
                      description.includes("15m") ||
                      description.includes("15-minute") ||
                      conditionId.includes("15m");
        
        return hasBTC && has15m;
      });

      console.log(`[INFO] [Polymarket] Found ${btcMarkets.length} BTC 15m markets`);
      return btcMarkets;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log("[ERROR] [Polymarket] Error fetching BTC markets:", errorMsg);
      throw new Error(`Failed to fetch Polymarket BTC markets: ${errorMsg}`);
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
      const market = await client.getMarket(marketId);
      
      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }

      // Determine token ID based on outcome
      // CLOB uses token IDs for YES/NO outcomes
      // For binary markets, first token is YES, second is NO
      let tokenId: string;
      if (outcome === 'YES') {
        tokenId = market.tokens?.[0]?.token_id || market.outcomeTokens?.[0] || marketId;
      } else {
        tokenId = market.tokens?.[1]?.token_id || market.outcomeTokens?.[1] || marketId;
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
      console.log(`[ERROR] [Polymarket] Error buying token:`, error);
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
      const market = await client.getMarket(marketId);
      
      if (!market) {
        return false;
      }

      // Check if market is resolved
      return market.resolved || market.status === 'resolved';
    } catch (error) {
      console.log(`[ERROR] [Polymarket] Error checking market resolution:`, error);
      return false;
    }
  }

  /**
   * Redeems tokens after market resolution
   * Note: Redemption is done via on-chain CTF contract, not CLOB client
   * This is a placeholder - actual redemption should use on-chain methods
   */
  async redeemTokens(marketId: string, outcome: 'YES' | 'NO'): Promise<boolean> {
    try {
      // Redemption requires on-chain contract interaction
      // This would need to be implemented using ethers.js and the CTF contract
      // For now, return false to indicate redemption is not implemented via this method
      console.log(`[WARNING] [Polymarket] Redemption via redeemTokens() is not implemented. Use on-chain redemption methods instead.`);
      return false;
    } catch (error) {
      console.log(`[ERROR] [Polymarket] Error redeeming tokens:`, error);
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
      console.log('[ERROR] [Polymarket] Error fetching positions:', error);
      return [];
    }
  }
}
