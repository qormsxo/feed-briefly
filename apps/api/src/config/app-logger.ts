import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { isString } from '../common/parse';

type LogInput = string | number | boolean | null | undefined | Error;

export class AppLogger implements LoggerService {
  private readonly console: ConsoleLogger;
  private readonly enabled: Set<LogLevel>;

  constructor(
    levels: LogLevel[],
    private readonly filePath: string,
  ) {
    this.enabled = new Set(levels);
    this.console = new ConsoleLogger({ logLevels: levels });
    mkdirSync(dirname(filePath), { recursive: true });
  }

  log(message: LogInput, ...optional: LogInput[]) {
    this.emit('log', message, optional);
  }

  error(message: LogInput, ...optional: LogInput[]) {
    this.emit('error', message, optional);
  }

  warn(message: LogInput, ...optional: LogInput[]) {
    this.emit('warn', message, optional);
  }

  debug(message: LogInput, ...optional: LogInput[]) {
    this.emit('debug', message, optional);
  }

  verbose(message: LogInput, ...optional: LogInput[]) {
    this.emit('verbose', message, optional);
  }

  private emit(level: LogLevel, message: LogInput, optional: LogInput[]) {
    const text = format(message);
    const rest = optional.map((value) => format(value));
    this.writeConsole(level, text, rest);
    this.writeFile(level, text, rest);
  }

  private writeConsole(level: LogLevel, text: string, rest: string[]) {
    switch (level) {
      case 'error':
        this.console.error(text, ...rest);

        return;
      case 'warn':
        this.console.warn(text, ...rest);

        return;
      case 'debug':
        this.console.debug(text, ...rest);

        return;
      case 'verbose':
        this.console.verbose(text, ...rest);

        return;
      case 'fatal':
        this.console.fatal(text, ...rest);

        return;
      default:
        this.console.log(text, ...rest);
    }
  }

  private writeFile(level: LogLevel, text: string, rest: string[]) {
    if (!this.enabled.has(level) || isQueryLog(text)) {
      return;
    }

    const parts = [text, ...rest].filter((part) => part.length > 0);
    appendFileSync(
      this.filePath,
      `${new Date().toISOString()} ${level.toUpperCase()} ${parts.join(' ')}\n`,
    );
  }
}

function isQueryLog(message: string) {
  return /^\s*query:/i.test(message);
}

function format(value: LogInput) {
  if (isString(value)) {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
