import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SESSION_COOKIE } from '../auth/auth.constants';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateUserKeywordsDto } from './dto/update-user-keywords.dto';
import { UserKeywordsService } from './user-keywords.service';

@ApiTags('keywords')
@ApiCookieAuth(SESSION_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('keywords')
export class UserKeywordsController {
  constructor(private readonly keywords: UserKeywordsService) {}

  @Get()
  @ApiOperation({ summary: '관심 한 줄과 제외 키워드' })
  list(@CurrentUser() user: AuthUser) {
    return this.keywords.getForUser(user.id);
  }

  @Put()
  @ApiOperation({ summary: '관심 한 줄과 제외 키워드 저장' })
  replace(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserKeywordsDto) {
    return this.keywords.replace(user.id, dto);
  }
}
