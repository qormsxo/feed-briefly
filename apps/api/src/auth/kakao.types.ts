import { isNumber, isPlainRecord, isString } from '../common/parse';

export type KakaoTokenResponse = {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

export type KakaoProfileResponse = {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
    };
  };
};

export function isKakaoToken(value: unknown): value is KakaoTokenResponse {
  if (!isPlainRecord(value)) {
    return false;
  }

  if (
    !('access_token' in value) ||
    !isString(value.access_token) ||
    value.access_token.length === 0
  ) {
    return false;
  }

  if (
    !('expires_in' in value) ||
    !isNumber(value.expires_in) ||
    !Number.isFinite(value.expires_in)
  ) {
    return false;
  }

  if (
    'token_type' in value &&
    value.token_type !== undefined &&
    !isString(value.token_type)
  ) {
    return false;
  }

  if (
    'refresh_token' in value &&
    value.refresh_token !== undefined &&
    !isString(value.refresh_token)
  ) {
    return false;
  }

  return true;
}

export function isKakaoProfile(value: unknown): value is KakaoProfileResponse {
  if (!isPlainRecord(value)) {
    return false;
  }

  if (!('id' in value) || !isNumber(value.id)) {
    return false;
  }

  if (!('kakao_account' in value) || value.kakao_account === undefined) {
    return true;
  }

  const account = value.kakao_account;

  if (!isPlainRecord(account)) {
    return false;
  }

  if ('email' in account && account.email !== undefined && !isString(account.email)) {
    return false;
  }

  if (!('profile' in account) || account.profile === undefined) {
    return true;
  }

  const profile = account.profile;

  if (!isPlainRecord(profile)) {
    return false;
  }

  if (
    'nickname' in profile &&
    profile.nickname !== undefined &&
    !isString(profile.nickname)
  ) {
    return false;
  }

  return true;
}
