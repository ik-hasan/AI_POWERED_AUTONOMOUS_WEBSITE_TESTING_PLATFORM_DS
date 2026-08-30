type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private service: string;
  private minLevel: LogLevel;

  constructor(service: string, minLevel: LogLevel = 'info') {
    this.service = service;
    this.minLevel = minLevel;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...meta,
    };
    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }
}
