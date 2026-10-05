import { BadRequestException } from '@nestjs/common';

export function assertPublicHttpUrl(raw: string) {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('올바른 URL이 아닙니다');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('http(s) URL만 등록할 수 있습니다');
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    isPrivateIp(host)
  ) {
    throw new BadRequestException('내부 주소는 등록할 수 없습니다');
  }
}

function isPrivateIp(host: string) {
  if (host === '::1' || host.startsWith('fe80:')) {
    return true;
  }

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);

  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);

  if (octets.some((n) => n > 255)) {
    return true;
  }

  const [a, b] = octets;

  if (a === 10 || a === 127 || a === 0) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  return false;
}
