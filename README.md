# Polymarket-Kalshi Arbitrage Bot

This is an arbitrage trading bot that exploits price differences between Polymarket and Kalshi prediction markets for 15-minute BTC markets.
The bot is built with TypeScript and operates on a core principle: when the sum of UP and DOWN token prices across both platforms is below a configurable threshold (default 90), there exists a profitable arbitrage opportunity.

**How It Works:**
The bot continuously scans matched 15-minute BTC markets on both platforms. When it detects that `polymarket_up_price + kalshi_down_price < take_profit` or `polymarket_down_price + kalshi_up_price < take_profit`, it evaluates the opportunity using betted prices to determine the optimal trading direction. The bot then executes simultaneous trades on both platforms and automatically redeems winning positions after market resolution.

**Key Features:**
- Real-time price monitoring with configurable scan intervals
- Intelligent arbitrage detection using betted price analysis
- Simultaneous trade execution on both platforms
- Automatic position tracking and redemption
- Risk management with configurable trade size limits
- Comprehensive error handling and logging

If you want, I can offer full version and can develop customized advanced project[Advantage: Betted price analysis, simultaneous execution, automatic redemption, risk management, TypeScript language].




## Advanced Version
In arbitrage trading bot, there are two main things: 
one is accurately matching markets between platforms and other one is making correct trading decisions based on betted prices.
In the basic version, market matching is done by simple time comparison and trading decisions are based only on price sums. But with the advanced version, I am using sophisticated market matching algorithms that consider market titles, underlying assets, and expiration times. The advanced version also implements intelligent betted price analysis to determine optimal trade directions, handles edge cases where betted prices are unavailable, and includes position validation to prevent duplicate trades. The bot uses parallel API calls for faster price fetching and implements retry logic with exponential backoff for robust error handling. Of course, it needs more development time because it needs to handle market synchronization, price validation, and complex decision trees, but otherwise using basic matching and simple price comparison is too easy for development and understanding.




---

## Integration Refactor (Latest Update)

**IMPORTANT:** The interaction layer with Polymarket and Kalshi has been refactored to use production-grade integration patterns from the sample repositories, while preserving all arbitrage logic exactly as-is.

### What Changed

1. **Polymarket Integration**
   - Replaced axios-based client with `@polymarket/clob-client`
   - Implemented proper wallet-based authentication using `PRIVATE_KEY`
   - Added credential management following sample repository patterns
   - Uses cached singleton CLOB client for efficiency
   - All methods preserve exact interface for arbitrage logic compatibility

2. **Kalshi Integration**
   - Replaced axios-based client with `kalshi-typescript` SDK
   - Implemented proper Configuration-based authentication
   - Uses MarketApi, OrdersApi, and PortfolioApi from SDK
   - Follows pagination patterns from sample repositories
   - All methods preserve exact interface for arbitrage logic compatibility

3. **New Modules**
   - `src/security/createCredential.ts` - Polymarket credential creation
   - `src/providers/clobclient.ts` - Cached CLOB client provider
   - `src/utils/config.ts` - Centralized configuration

### What Stayed the Same

- **All arbitrage detection logic** - Unchanged
- **All opportunity calculation** - Unchanged
- **All execution decision logic** - Unchanged
- **All strategy flow** - Unchanged
- **All state machine behavior** - Unchanged
- **All order sequencing logic** - Unchanged

### Environment Variables

The bot now requires:
- `PRIVATE_KEY` - For Polymarket wallet authentication (required)
- `KALSHI_API_KEY` - For Kalshi API authentication (required)
- `KALSHI_PRIVATE_KEY_PATH` or `KALSHI_PRIVATE_KEY_PEM` - For Kalshi order signing (optional, may be required for trading)
- `CHAIN_ID` - Chain ID for Polymarket (default: 137 for Polygon)

See setup instructions below for complete environment variable list.

---


## How To Run
1. Environment Variables Settings
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with your actual credentials:
   ```plaintext
   # Polymarket Authentication (REQUIRED)
   PRIVATE_KEY=your_private_key_here
   POLYMARKET_API_URL=https://clob.polymarket.com
   CHAIN_ID=137

   # Kalshi Authentication (REQUIRED)
   KALSHI_API_KEY=your_kalshi_api_key_here
   KALSHI_API_URL=https://trading-api.kalshi.com/trade-api/v2
   # Optional: For order signing
   KALSHI_PRIVATE_KEY_PATH=/path/to/private/key.pem
   # OR
   KALSHI_PRIVATE_KEY_PEM=-----BEGIN PRIVATE KEY-----\n...

   # Trading Configuration
   MIN_TRADE_AMOUNT=10
   MAX_TRADE_AMOUNT=1000
   TRADE_PERCENTAGE=0.1
   AVAILABLE_BALANCE=1000
   TAKE_PROFIT=90
   SCAN_INTERVAL=5000
   REDEEM_CHECK_INTERVAL=60000
   ```
   
   See `.env.example` for a complete template with all available options and descriptions.

2. Set up environment variables:
   ```bash
   cp env.example .env
   ```
   Then edit `.env` with your actual credentials. See `env.example` for all available options.

3. Install dependencies:
   ```bash
   npm install
   ```
   This will install:
   - `@polymarket/clob-client` - Polymarket CLOB API client
   - `kalshi-typescript` - Kalshi TypeScript SDK
   - `@ethersproject/wallet` - Ethereum wallet utilities
   - Other required dependencies

4. Initialize Polymarket credentials:
   On first run, the bot will automatically create API credentials using your `PRIVATE_KEY`.
   Credentials are saved to `src/data/credential.json`.

5. Build the project:
   ```bash
   npm run build
   ```

6. Run the bot:
- **`npm run run`** – Run the main script (e.g. fetch balance via REST).
- **`npm run bot`** – Run the Bitcoin up/down trading bot (see below).
- **`npm run monitor`** – Run real-time price monitor for UP/DOWN best bid/ask (see below).
- **`npm start`** – Start the Express server (default port 5000).
- **`npm run build`** – Compile TypeScript to `dist/`.



## Bot Workflow
### Price Monitoring
* Continuously monitors UP and DOWN token prices on both Polymarket and Kalshi
* Matches 15-minute BTC markets between platforms based on end times
* Updates prices every 5 seconds (configurable)

### Arbitrage Detection
* Detects opportunities when: poly_up_price + kalshi_down_price < take_profit (configurable, default 90)
* Detects opportunities when: poly_down_price + kalshi_up_price < take_profit (configurable, default 90)
* Calculates profit potential for each opportunity
* Applies business logic to determine if trade should proceed or skip

### Trade Execution
* Executes trades when profitable opportunities are detected
* Manages position sizes based on available balance and risk settings
* Tracks all active positions across both platforms

### Automatic Redemption
* Monitors market resolution status every minute
* Automatically redeems winning tokens after markets resolve
* Updates position status to 'redeemed' after successful redemption



## Arbitrage Logic
### When Both Cases Match
If both `poly_up + kalshi_down < take_profit` and `poly_down + kalshi_up < take_profit`:
- Compare betted prices between platforms
- If kalshi_betted > poly_betted: Buy Kalshi DOWN + Polymarket UP
- If kalshi_betted < poly_betted: Buy Kalshi UP + Polymarket DOWN
- This handles cases where final price falls between the two betted prices

### When Only One Case Matches
**Case 1: poly_up + kalshi_down < take_profit**
- If poly_betted < kalshi_betted: Proceed with trade
- If poly_betted >= kalshi_betted: Skip (risk of loss)

**Case 2: poly_down + kalshi_up < take_profit**
- If poly_betted > kalshi_betted: Proceed with trade
- If poly_betted <= kalshi_betted: Skip (risk of loss)

This logic ensures trades only execute when there's a high probability of profit based on the betted prices.
