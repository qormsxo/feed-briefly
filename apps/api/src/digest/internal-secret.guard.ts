import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(
    @Inject(ConfigService)
    private readonly config: { get(key: string): string | undefined },
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const secret = request.headers['x-internal-secret'];
    const expected = this.config.get('INTERNAL_SECRET');

    if (!expected || secret !== expected) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
