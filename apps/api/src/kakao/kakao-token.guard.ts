import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';
import { KakaoTokenService } from './kakao-token.service';

@Injectable()
export class KakaoTokenGuard implements CanActivate {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: KakaoTokenService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      kakaoUser?: unknown;
    }>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(request.user.id);

    if (!user) {
      throw new UnauthorizedException();
    }

    await this.tokens.getValidAccessToken(user);
    request.kakaoUser = user;

    return true;
  }
}
