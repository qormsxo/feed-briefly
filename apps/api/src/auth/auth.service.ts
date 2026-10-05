import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenCryptoService } from '../common/crypto/token-crypto.service';
import { UsersService } from '../users/users.service';
import {
  KAKAO_AUTHORIZE_URL,
  KAKAO_TOKEN_URL,
  KAKAO_USER_ME_URL,
} from './auth.constants';
import { AuthUser, JwtPayload } from './auth.types';
import { KakaoProfileResponse, KakaoTokenResponse, isKakaoProfile, isKakaoToken } from './kakao.types';
import { sessionCookieOptions } from './session-cookie';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  buildAuthorizeUrl() {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow('KAKAO_REST_API_KEY'),
      redirect_uri: this.config.getOrThrow('KAKAO_REDIRECT_URI'),
      response_type: 'code',
      scope: 'profile_nickname,talk_message',
    });

    return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
  }

  async loginWithKakaoCode(code: string): Promise<AuthUser> {
    const tokens = await this.exchangeCode(code);

    if (!tokens.refresh_token) {
      throw new UnauthorizedException('카카오 토큰 교환에 실패했습니다');
    }

    const refreshToken = tokens.refresh_token;
    const profile = await this.fetchProfile(tokens.access_token);

    const user = await this.users.upsertFromKakao({
      kakaoId: String(profile.id),
      nickname: profile.kakao_account?.profile?.nickname ?? null,
      email: profile.kakao_account?.email ?? null,
      kakaoAccessToken: this.tokenCrypto.encrypt(tokens.access_token),
      kakaoRefreshToken: this.tokenCrypto.encrypt(refreshToken),
      kakaoTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    return {
      id: user.id,
      kakaoId: user.kakaoId,
      nickname: user.nickname,
    };
  }

  issueJwt(user: AuthUser) {
    const payload: JwtPayload = { sub: user.id, kakaoId: user.kakaoId };

    return this.jwt.sign(payload);
  }

  cookieOptions() {
    return sessionCookieOptions({
      nodeEnv: this.config.get('NODE_ENV'),
      webOrigin: this.config.getOrThrow('WEB_ORIGIN'),
      redirectUri: this.config.getOrThrow('KAKAO_REDIRECT_URI'),
    });
  }

  private async exchangeCode(code: string): Promise<KakaoTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.getOrThrow('KAKAO_REST_API_KEY'),
      client_secret: this.config.getOrThrow('KAKAO_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow('KAKAO_REDIRECT_URI'),
      code,
    });

    const response = await fetch(KAKAO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.warn(`카카오 토큰 교환 실패 status=${response.status}`);
      this.logger.debug(detail);
      throw new UnauthorizedException('카카오 토큰 교환에 실패했습니다');
    }

    const payload: unknown = await response.json();

    if (!isKakaoToken(payload)) {
      throw new UnauthorizedException('카카오 토큰 교환에 실패했습니다');
    }

    return payload;
  }

  private async fetchProfile(accessToken: string): Promise<KakaoProfileResponse> {
    const response = await fetch(KAKAO_USER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      this.logger.warn(`카카오 사용자 조회 실패 status=${response.status}`);
      throw new UnauthorizedException('카카오 사용자 정보를 가져오지 못했습니다');
    }

    const body: unknown = await response.json();

    if (!isKakaoProfile(body)) {
      throw new UnauthorizedException('카카오 사용자 정보를 가져오지 못했습니다');
    }

    return body;
  }
}
