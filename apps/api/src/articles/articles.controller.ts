import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SESSION_COOKIE } from '../auth/auth.constants';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DigestService } from '../digest/digest.service';
import { ArticleIngestService } from './article-ingest.service';
import { ArticlesService } from './articles.service';
import { ListArticlesQuery } from './dto/list-articles.query';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

@ApiTags('articles')
@ApiCookieAuth(SESSION_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly ingest: ArticleIngestService,
    private readonly articles: ArticlesService,
    private readonly digest: DigestService,
  ) {}

  @Get()
  @ApiOperation({ summary: '내 요약 히스토리' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListArticlesQuery) {
    return this.articles.paginateByUser(user.id, query.page, query.limit);
  }

  @Post('ingest')
  @ApiOperation({
    summary:
      '수집/요약 후, 미발송 요약을 글마다 카카오톡으로 보내고 원문 링크를 포함',
  })
  async ingestMine(@CurrentUser() user: AuthUser) {
    const pressedAt = new Date();
    const articles = await this.ingest.ingestForUser(user.id);
    const since = new Date(pressedAt.getTime() - LOOKBACK_MS);
    const kakao = await this.digest.sendUnsentForUser(user.id, since);

    return {
      count: articles.length,
      sent: kakao.sent,
      kakaoError: kakao.error ?? null,
    };
  }
}
