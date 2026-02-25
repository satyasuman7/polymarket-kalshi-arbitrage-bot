/**
 * Custom Error Classes
 */

export class ArbitrageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ArbitrageError';
  }
}

export class APIError extends Error {
  constructor(message: string, public statusCode?: number, public platform?: string) {
    super(message);
    this.name = 'APIError';
  }
}

export class TradeError extends Error {
  constructor(message: string, public marketId?: string) {
    super(message);
    this.name = 'TradeError';
  }
}
