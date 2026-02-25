import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { Chain } from "@polymarket/clob-client";

dotenvConfig({ path: resolve(process.cwd(), ".env") });

/**
 * Centralized configuration for all API URLs and endpoints
 * Following the pattern from sample repositories
 */
export const config = {
    /**
     * CLOB API Configuration
     */
    clob: {
        apiUrl: process.env.POLYMARKET_API_URL || "https://clob.polymarket.com",
    },

    /**
     * Kalshi API Configuration
     */
    kalshi: {
        apiUrl: process.env.KALSHI_API_URL || "https://trading-api.kalshi.com/trade-api/v2",
    },

    /**
     * Chain Configuration
     */
    chain: {
        chainId: parseInt(`${process.env.CHAIN_ID || Chain.POLYGON}`) as Chain,
    },
} as const;
