import { Injectable, Logger } from '@nestjs/common';
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { User } from '../users/user.entity';
import { KakaoTokenService } from './kakao-token.service';

type KakaoRequestConfig = InternalAxiosRequestConfig & {
  kakaoUser?: User;
  kakaoRetried?: boolean;
};

function isKakaoRequestConfig(
  value: InternalAxiosRequestConfig | undefined,
): value is KakaoRequestConfig {
  return value !== undefined;
}

@Injectable()
export class KakaoApiClient {
  private readonly logger = new Logger(KakaoApiClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly tokens: KakaoTokenService) {
    this.http = axios.create({
      baseURL: 'https://kapi.kakao.com',
      timeout: 10_000,
    });

    this.http.interceptors.request.use(async (config: KakaoRequestConfig) => {
      if (config.kakaoUser) {
        const accessToken = await this.tokens.getValidAccessToken(
          config.kakaoUser,
        );

        config.headers.set('Authorization', `Bearer ${accessToken}`);
      }

      return config;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config;

        if (!isKakaoRequestConfig(config)) {
          return Promise.reject(error);
        }

        const status = error.response?.status;

        if (status === 401 && config?.kakaoUser && !config.kakaoRetried) {
          this.logger.warn('카카오 API 401, 토큰 갱신 후 재시도');
          config.kakaoRetried = true;
          const accessToken = await this.tokens.refresh(config.kakaoUser);
          config.headers.set('Authorization', `Bearer ${accessToken}`);

          return this.http.request(config);
        }

        return Promise.reject(error);
      },
    );
  }

  async request<T>(user: User, config: AxiosRequestConfig): Promise<T> {
    const requestConfig: AxiosRequestConfig & { kakaoUser: User } = {
      ...config,
      kakaoUser: user,
    };

    const { data } = await this.http.request<T>(requestConfig);

    return data;
  }
}
