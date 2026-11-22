import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  IsNull,
  MoreThanOrEqual,
  InsertResult,
  QueryDeepPartialEntity,
  UpdateResult,
} from 'typeorm';
import { newsThemeLabel } from '../crawl/news-themes';
import { ArticleFeedback, FeedbackValue } from './article-feedback.entity';
import { Article } from './article.entity';

type ArticleStore = {
  find(options: FindManyOptions<Article>): Promise<Article[]>;
  findOne(options: FindOneOptions<Article>): Promise<Article | null>;
  findAndCount(options: FindManyOptions<Article>): Promise<[Article[], number]>;
  update(
    criteria: FindOptionsWhere<Article>,
    values: QueryDeepPartialEntity<Article>,
  ): Promise<UpdateResult>;
};

type FeedbackStore = {
  find(options: FindManyOptions<ArticleFeedback>): Promise<ArticleFeedback[]>;
  upsert(
    values: QueryDeepPartialEntity<ArticleFeedback>,
    options: { conflictPaths: (keyof ArticleFeedback)[] },
  ): Promise<InsertResult>;
  delete(criteria: FindOptionsWhere<ArticleFeedback>): Promise<DeleteResult>;
};

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articles: ArticleStore,
    @InjectRepository(ArticleFeedback)
    private readonly feedback: FeedbackStore,
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
      relations: { feed: true },
      order: { collectedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const feedbackByArticle = await this.feedbackFor(
      userId,
      rows.map((row) => row.id),
    );

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
            : null),
        feedUrl: row.feed?.url ?? row.link,
        theme: row.theme ? newsThemeLabel(row.theme) : null,
        feedback: feedbackByArticle.get(row.id) ?? null,
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  /** 추천/비추천을 저장한다. 같은 기사에 다시 보내면 값만 바꾼다. */
  async setFeedback(userId: string, articleId: string, value: FeedbackValue) {
    await this.assertOwnArticle(userId, articleId);
    await this.feedback.upsert(
      { userId, articleId, value, updatedAt: new Date() },
      { conflictPaths: ['userId', 'articleId'] },
    );

    return { articleId, feedback: value };
  }

  async clearFeedback(userId: string, articleId: string) {
    await this.assertOwnArticle(userId, articleId);
    await this.feedback.delete({ userId, articleId });

    return { articleId, feedback: null };
  }

  private async assertOwnArticle(userId: string, articleId: string) {
    const article = await this.articles.findOne({
      where: { id: articleId, userId },
      select: { id: true },
    });

    if (!article) {
      throw new NotFoundException('기사를 찾을 수 없습니다');
    }
  }

  /** 한 페이지 기사들의 피드백을 쿼리 한 번으로 가져온다. */
  private async feedbackFor(userId: string, articleIds: string[]) {
    const byArticle = new Map<string, FeedbackValue>();

    if (articleIds.length === 0) {
      return byArticle;
    }

    const rows = await this.feedback.find({
      where: { userId, articleId: In(articleIds) },
      select: { articleId: true, value: true },
    });

    for (const row of rows) {
      byArticle.set(row.articleId, row.value);
    }

    return byArticle;
  }
}
