import { LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

function isLogLevel(value: string | undefined): value is LogLevel {
  return LEVELS.some((level) => level === value);
}

export function nestLogLevels(level?: string): LogLevel[] {
  const current = isLogLevel(level) ? level : 'log';

  return LEVELS.slice(0, LEVELS.indexOf(current) + 1);
}
