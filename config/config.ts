/**
 * Configuration Management
 * Centralized configuration for the bot
 */

export interface BotConfig {
  polymarket: {
    apiKey?: string;
    apiUrl: string;
  };
  kalshi: {
    apiKey?: string;
    apiUrl: string;
  };
  trading: {
    minTradeAmount: number;
    maxTradeAmount: number;
    tradePercentage: number;
    availableBalance: number;
    takeProfit: number; // Profit threshold (default 90)
  };
  bot: {
    scanInterval: number;
    redeemCheckInterval: number;
  };
}

export function loadConfig(): BotConfig {
  return {
    polymarket: {
      apiKey: process.env.POLYMARKET_API_KEY,
      apiUrl: process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
    },
    kalshi: {
      apiKey: process.env.KALSHI_API_KEY,
      apiUrl: process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2',
    },
    trading: {
      minTradeAmount: parseFloat(process.env.MIN_TRADE_AMOUNT || '10'),
      maxTradeAmount: parseFloat(process.env.MAX_TRADE_AMOUNT || '1000'),
      tradePercentage: parseFloat(process.env.TRADE_PERCENTAGE || '0.1'),
      availableBalance: parseFloat(process.env.AVAILABLE_BALANCE || '1000'),
      takeProfit: parseFloat(process.env.TAKE_PROFIT || '90'),
    },
    bot: {
      scanInterval: parseInt(process.env.SCAN_INTERVAL || '5000'),
      redeemCheckInterval: parseInt(process.env.REDEEM_CHECK_INTERVAL || '60000'),
    },
  };
}
