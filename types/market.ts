/**
 * Market data types for Polymarket and Kalshi
 */

export interface MarketPrice {
  upPrice: number;      // Price of "Yes" or "Up" token (0-100)
  downPrice: number;    // Price of "No" or "Down" token (0-100)
  bettedPrice?: number; // The betted/resolved price if available
  timestamp: number;
}

export interface MarketData {
  marketId: string;
  marketTitle: string;
  endTime: number;      // Unix timestamp
  isResolved: boolean;
  resolvedPrice?: number;
  polymarket: MarketPrice;
  kalshi: MarketPrice;
}

export interface ArbitrageOpportunity {
  marketId: string;
  marketTitle: string;
  opportunityType: 'both' | 'poly_up_kalshi_down' | 'poly_down_kalshi_up';
  polyUpPrice: number;
  polyDownPrice: number;
  kalshiUpPrice: number;
  kalshiDownPrice: number;
  totalCost: number;    // Sum of prices (should be < 90)
  profitPotential: number; // Expected profit percentage
  polyBettedPrice?: number;
  kalshiBettedPrice?: number;
  action: 'buy_poly_up_kalshi_down' | 'buy_poly_down_kalshi_up' | 'skip';
  timestamp: number;
}

export interface Trade {
  id: string;
  marketId: string;
  platform: 'polymarket' | 'kalshi';
  side: 'up' | 'down';
  amount: number;
  price: number;
  timestamp: number;
  status: 'pending' | 'filled' | 'failed';
  txHash?: string;
}

export interface Position {
  marketId: string;
  polyUp: number;      // Amount of Polymarket UP tokens
  polyDown: number;    // Amount of Polymarket DOWN tokens
  kalshiUp: number;    // Amount of Kalshi UP tokens
  kalshiDown: number;  // Amount of Kalshi DOWN tokens
  totalCost: number;
  expectedProfit: number;
  status: 'active' | 'redeemed' | 'expired';
}
