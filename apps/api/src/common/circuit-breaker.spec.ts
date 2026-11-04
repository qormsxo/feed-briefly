import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      resetMs: 60_000,
    });

    const fn = jest.fn(() => Promise.reject(new Error('down')));

    await expect(breaker.exec(fn)).rejects.toThrow('down');
    await expect(breaker.exec(fn)).rejects.toThrow('down');
    await expect(breaker.exec(fn)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(breaker.exec(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not run fn while open', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetMs: 60_000,
      now: () => 0,
    });

    const fn = jest.fn(() => Promise.reject(new Error('down')));

    await expect(breaker.exec(fn)).rejects.toThrow('down');
    await expect(breaker.exec(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('moves to half-open after resetMs and closes on success', async () => {
    let now = 0;

    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetMs: 60_000,
      now: () => now,
    });

    await expect(
      breaker.exec(() => Promise.reject(new Error('down'))),
    ).rejects.toThrow('down');

    now = 60_000;
    const probe = jest.fn(() => Promise.resolve('ok'));
    await expect(breaker.exec(probe)).resolves.toBe('ok');
    expect(probe).toHaveBeenCalledTimes(1);

    const next = jest.fn(() => Promise.resolve('again'));
    await expect(breaker.exec(next)).resolves.toBe('again');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reopens when half-open probe fails', async () => {
    let now = 0;

    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetMs: 60_000,
      now: () => now,
    });

    await expect(
      breaker.exec(() => Promise.reject(new Error('down'))),
    ).rejects.toThrow('down');

    now = 60_000;
    const probe = jest.fn(() => Promise.reject(new Error('still down')));
    await expect(breaker.exec(probe)).rejects.toThrow('still down');
    expect(probe).toHaveBeenCalledTimes(1);

    const blocked = jest.fn(() => Promise.resolve('ok'));
    await expect(breaker.exec(blocked)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(blocked).not.toHaveBeenCalled();
  });
});
