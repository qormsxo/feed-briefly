import { CookieOptions } from 'express';
import { isProduction, parseOrigins } from '../config/env.validation';

export function sessionCookieOptions(input: {
  nodeEnv?: string;
  webOrigin: string;
  redirectUri: string;
}): CookieOptions {
  const production = isProduction(input.nodeEnv);

  return {
    httpOnly: true,
    secure: production,
    sameSite: cookieSameSite(production, input.webOrigin, input.redirectUri),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function cookieSameSite(
  production: boolean,
  webOrigin: string,
  redirectUri: string,
): 'lax' | 'none' {
  if (!production) {
    return 'lax';
  }

  return isCrossSite(webOrigin, redirectUri) ? 'none' : 'lax';
}

function isCrossSite(webOrigin: string, redirectUri: string): boolean {
  try {
    const webHost = new URL(parseOrigins(webOrigin)[0] ?? '').hostname;
    const apiHost = new URL(redirectUri).hostname;

    return Boolean(webHost) && webHost !== apiHost;
  } catch {
    return true;
  }
}
