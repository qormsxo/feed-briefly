import { Logger } from '@nestjs/common';
import { isError, isNumber } from './parse';

export type RetryOptions = {
  retries?: number;
  delayMs?: number;
  logger?: Logger;
  retryOn?: (error: Error) => boolean;
};

type StatusError = Error & { status: number };

function hasNumericStatus(error: Error): error is StatusError {
  if (!('status' in error)) {
    return false;
  }

  return isNumber(error.status);
}

export function isDailyQuotaError(error: Error): boolean {
  if (hasNumericStatus(error) && error.status === 429) {
    return true;
  }

  return error.message.includes('[429') || error.message.includes('Quota exceeded');
}

export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 400;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const failure = isError(error) ? error : new Error(String(error));
      lastError = failure;

      const retry = attempt < retries && (options.retryOn?.(failure) ?? true);

      options.logger?.warn(
        `${operation} 실패 attempt=${attempt}/${retries} reason=${failure.message}`,
      );

      if (!retry) {
        break;
      }

      await sleep(delayMs * attempt);
    }
  }

  throw lastError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
