import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SESSION_COOKIE } from './auth.constants';
import { AuthUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Throttle({ default: { limit: 8, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('kakao')
  @ApiOperation({ summary: '카카오 인가 화면으로 이동' })
  redirectToKakao(@Res() res: Response) {
    return res.redirect(this.auth.buildAuthorizeUrl());
  }

  @Get('kakao/callback')
  @UseGuards(AuthGuard('kakao'))
  @ApiOperation({ summary: '카카오 인가 코드 콜백' })
  callback(
    @Req() req: Request & { user: AuthUser },
    @Res() res: Response,
  ) {
    const jwt = this.auth.issueJwt(req.user);
    res.cookie(SESSION_COOKIE, jwt, this.auth.cookieOptions());
    const webOrigin = this.config.get('WEB_ORIGIN') ?? 'http://localhost:5173';

    return res.redirect(`${webOrigin}/auth/callback`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: '현재 로그인 사용자' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('logout')
  @ApiOperation({ summary: '세션 쿠키 삭제' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, this.auth.cookieOptions());

    return { ok: true };
  }
}
