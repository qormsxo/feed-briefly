import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feed } from './feed.entity';
import { FeedsService } from './feeds.service';

// RSS 등록 API·UI는 제거했다. Feed 테이블은 예전 article.feedId FK용으로만 남긴다.
@Module({
  imports: [TypeOrmModule.forFeature([Feed])],
  providers: [FeedsService],
  exports: [FeedsService, TypeOrmModule],
})
export class FeedsModule {}
