import { UnauthorizedException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { KakaoTokenService } from './kakao-token.service';

describe('KakaoTokenService', () => {
  const crypto = {
    decrypt: jest.fn(),
    encrypt: jest.fn((value: string) => `enc:${value}`),
  };

  const users = {
    saveKakaoTokens: jest.fn(),
  };

  const config = {
    getOrThrow: jest.fn((key: string) => key),
  };

  let service: KakaoTokenService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      fetchMock(input, init);
    service = new KakaoTokenService(config, crypto, users);
  });

  it('returns decrypted access token when not expiring', async () => {
    crypto.decrypt.mockReturnValue('live-token');

    const liveUser = {
      kakaoAccessToken: 'enc',
      kakaoTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    // SAFETY: the spec only reads the access token and its expiry.
    const user = liveUser as User;

    await expect(service.getValidAccessToken(user)).resolves.toBe('live-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes when expiry is missing', async () => {
    crypto.decrypt.mockReturnValue('refresh-token');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        expires_in: 3600,
      }),
    });

    const refreshingUser = {
      id: 'u1',
      kakaoRefreshToken: 'enc-refresh',
      kakaoTokenExpiresAt: null,
    };

    // SAFETY: the spec only reads the refresh token and the missing expiry.
    const user = refreshingUser as User;

    await expect(service.getValidAccessToken(user)).resolves.toBe('new-access');
    expect(users.saveKakaoTokens).toHaveBeenCalled();
  });

  it('throws when kakao refresh fails', async () => {
    crypto.decrypt.mockReturnValue('refresh-token');
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    const expiredUser = {
      id: 'u1',
      kakaoRefreshToken: 'enc',
      kakaoTokenExpiresAt: new Date(0),
    };

    // SAFETY: the spec only reads the refresh token and the expired timestamp.
    const user = expiredUser as User;

    await expect(service.refresh(user)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
