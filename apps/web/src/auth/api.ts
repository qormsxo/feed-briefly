import { http } from '../lib/http';
import { AuthUser } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function startKakaoLogin() {
  window.location.assign(`${API_URL}/api/auth/kakao`);
}

export function fetchMe() {
  return http<AuthUser>('/api/auth/me');
}

export function logout() {
  return http<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function withdraw() {
  return http<{ ok: boolean }>('/api/auth/me', { method: 'DELETE' });
}
