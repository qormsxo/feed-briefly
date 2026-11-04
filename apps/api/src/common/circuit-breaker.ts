export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit open: ${name}`);
    this.name = 'CircuitOpenError';
  }
}

export type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetMs?: number;
  now?: () => number;
};

type CircuitState = 'closed' | 'open' | 'halfOpen';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetMs: number;
  private readonly now: () => number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetMs = options.resetMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();

      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private maybeTransitionToHalfOpen() {
    if (this.state !== 'open') {
      return;
    }

    if (this.now() - this.openedAt >= this.resetMs) {
      this.state = 'halfOpen';
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures += 1;

    if (this.state === 'halfOpen' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}
