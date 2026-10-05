import { TokenCryptoService } from './token-crypto.service';

const KEY = 'ab'.repeat(32);

function createService() {
  return new TokenCryptoService({
    getOrThrow: () => KEY,
  });
}

describe('TokenCryptoService', () => {
  it('encrypts and decrypts the original value', () => {
    const crypto = createService();
    const cipher = crypto.encrypt('kakao-access-token');
    expect(cipher).not.toContain('kakao-access-token');
    expect(crypto.decrypt(cipher)).toBe('kakao-access-token');
  });

  it('produces a different ciphertext each time', () => {
    const crypto = createService();
    expect(crypto.encrypt('same')).not.toBe(crypto.encrypt('same'));
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(
      () =>
        new TokenCryptoService({
          getOrThrow: () => 'short',
        }),
    ).toThrow('TOKEN_ENCRYPTION_KEY must be 32-byte hex');
  });

  it('rejects a malformed payload', () => {
    const crypto = createService();
    expect(() => crypto.decrypt('not-a-cipher')).toThrow('잘못된 암호문 형식');
  });
});
