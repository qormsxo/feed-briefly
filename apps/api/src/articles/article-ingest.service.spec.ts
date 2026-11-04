import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HtmlCrawlerService } from '../crawl/html-crawler.service';
import { UserKeywordsService } from '../crawl/user-keywords.service';
import { UserThemesService } from '../crawl/user-themes.service';
import { FeedsService } from '../feeds/feeds.service';
import { GeminiService } from '../gemini/gemini.service';
import { RssParserService } from '../rss/rss-parser.service';
import { Article } from './article.entity';
import { ArticleIngestService } from './article-ingest.service';

const USER_ID = 'user-1';

const page = {
  link: 'https://news.example/1',
  title: 'title',
  text: 'body',
  publishedAt: new Date(),
};

type Brief = { title: string; summary: string; interest: number };

async function createService(options: {
  pages: (typeof page)[];
  summarize: () => Promise<(Brief | null)[]>;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ArticleIngestService,
      {
        provide: getRepositoryToken(Article),
        useValue: {
          findOneBy: () => Promise.resolve(null),
          create: (value: Partial<Article>) => value,
          save: (value: Partial<Article>) => Promise.resolve(value),
        },
      },
      { provide: FeedsService, useValue: {} },
      { provide: RssParserService, useValue: {} },
      {
        provide: UserThemesService,
        useValue: {
          listByUser: () => Promise.resolve([{ userId: USER_ID, theme: 'it' }]),
        },
      },
      {
        provide: UserKeywordsService,
        useValue: {
          listByUser: () => Promise.resolve({ include: [], exclude: [] }),
        },
      },
      {
        provide: HtmlCrawlerService,
        useValue: {
          collectThemeArticles: () => Promise.resolve(options.pages),
        },
      },
      {
        provide: GeminiService,
        useValue: {
          summarizeMany: options.summarize,
          rankByInterest: () => Promise.resolve([0]),
        },
      },
    ],
  }).compile();

  return moduleRef.get(ArticleIngestService);
}

describe('ArticleIngestService.ingestForUser', () => {
  it('throws when nothing could be fetched', async () => {
    const service = await createService({
      pages: [],
      summarize: () => Promise.resolve([]),
    });

    await expect(service.ingestForUser(USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when every summary fails', async () => {
    const service = await createService({
      pages: [page],
      summarize: () => Promise.reject(new Error('503')),
    });

    await expect(service.ingestForUser(USER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns saved articles on success', async () => {
    const service = await createService({
      pages: [page],
      summarize: () =>
        Promise.resolve([{ title: 'T', summary: 'S', interest: 5 }]),
    });

    await expect(service.ingestForUser(USER_ID)).resolves.toHaveLength(1);
  });
});
