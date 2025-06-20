import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';

class Logger {
  private logger: winston.Logger;

  constructor() {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    fs.ensureDirSync(logsDir);

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaString = Object.keys(meta).length > 0 ? '\n' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}${metaString}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: process.env.LOG_FILE || path.join(logsDir, 'proxy.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    });
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error | any): void {
    this.logger.error(message, error);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  http(message: string, meta?: any): void {
    this.logger.http(message, meta);
  }
}

export const logger = new Logger(); 