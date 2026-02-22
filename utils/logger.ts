/**
 * Logger Utility
 * Provides structured logging for the bot
 */

export class Logger {
  private static formatTimestamp(): string {
    return new Date().toISOString();
  }

  static info(message: string, ...args: any[]): void {
    console.log(`[${this.formatTimestamp()}] [INFO] ${message}`, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`[${this.formatTimestamp()}] [ERROR] ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`[${this.formatTimestamp()}] [WARN] ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG === 'true') {
      console.log(`[${this.formatTimestamp()}] [DEBUG] ${message}`, ...args);
    }
  }
}
