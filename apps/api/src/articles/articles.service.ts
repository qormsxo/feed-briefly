import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindManyOptions,
  FindOptionsWhere,
  In,
  IsNull,
  MoreThanOrEqual,
  QueryDeepPartialEntity,
  UpdateResult,
} from 'typeorm';
import { newsThemeLabel } from '../crawl/news-themes';
import { Article } from './article.entity';

type ArticleStore = {
  find(options: FindManyOptions<Article>): Promise<Article[]>;
  findAndCount(options: FindManyOptions<Article>): Promise<[Article[], number]>;
  update(
    criteria: FindOptionsWhere<Article>,
    values: QueryDeepPartialEntity<Article>,
  ): Promise<UpdateResult>;
};

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articles: ArticleStore,
  ) {}

  listUnsentSince(userId: string, since: Date, take = 20) {
    return this.articles.find({
      where: {
        userId,
        collectedAt: MoreThanOrEqual(since),
        kakaoSentAt: IsNull(),
      },
      order: { collectedAt: 'DESC' },
      take,
    });
  }

  markKakaoSent(ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve();
    }

    return this.articles.update({ id: In(ids) }, { kakaoSentAt: new Date() });
  }

  async paginateByUser(userId: string, page: number, limit: number) {
    const [rows, total] = await this.articles.findAndCount({
      where: { userId },
      relations: { feed: true, crawlSource: true },
      order: { collectedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        link: row.link,
        summary: row.summary,
        publishedAt: row.publishedAt,
        collectedAt: row.collectedAt,
        feedTitle:
          row.feed?.title ??
          (row.theme
            ? `네이버·다음·구글 · ${newsThemeLabel(row.theme)}`
            : row.crawlSource
              ? `${row.crawlSource.theme} · ${row.crawlSource.title ?? row.crawlSource.url}`
              : null),
        feedUrl: row.feed?.url ?? row.crawlSource?.url ?? row.link,
        theme: row.theme
          ? newsThemeLabel(row.theme)
          : row.crawlSource?.theme ?? null,
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }
}
