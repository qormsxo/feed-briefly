import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrawlSourcesModule } from '../crawl/crawl-sources.module';
import { DigestModule } from '../digest/digest.module';
import { FeedsModule } from '../feeds/feeds.module';
import { GeminiModule } from '../gemini/gemini.module';
import { Article } from './article.entity';
import { ArticleIngestService } from './article-ingest.service';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article]),
    // Feed 엔티티 FK 로드용. 수집 경로에서는 더 이상 FeedsService를 쓰지 않는다.
    FeedsModule,
    CrawlSourcesModule,
    GeminiModule,
    forwardRef(() => DigestModule),
  ],
  controllers: [ArticlesController],
  providers: [ArticleIngestService, ArticlesService],
  exports: [ArticleIngestService, ArticlesService],
})
export class ArticlesModule {}
