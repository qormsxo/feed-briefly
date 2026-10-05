import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';

function contextWithSecret(secret?: string): ExecutionContext {
  // SAFETY: the spec only reads the internal secret header.
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: secret ? { 'x-internal-secret': secret } : {},
      }),
    }),
  } as ExecutionContext;
}

function guardWith(secret: string) {
  return new InternalSecretGuard({
    get: () => secret,
  });
}

describe('InternalSecretGuard', () => {
  it('allows a matching secret', () => {
    expect(guardWith('s3cret').canActivate(contextWithSecret('s3cret'))).toBe(
      true,
    );
  });

  it('rejects a missing or empty env secret', () => {
    expect(() => guardWith('').canActivate(contextWithSecret('s3cret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a mismatched header', () => {
    expect(() =>
      guardWith('s3cret').canActivate(contextWithSecret('nope')),
    ).toThrow(UnauthorizedException);
  });
});
