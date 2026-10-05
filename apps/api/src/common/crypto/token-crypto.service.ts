import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class TokenCryptoService {
  private readonly key: Buffer;

  constructor(
    @Inject(ConfigService)
    config: { getOrThrow(key: string): string },
  ) {
    const hex = config.getOrThrow('TOKEN_ENCRYPTION_KEY');
    this.key = Buffer.from(hex, 'hex');

    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32-byte hex');
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');

    if (!ivHex || !tagHex || !dataHex) {
      throw new Error('잘못된 암호문 형식');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
