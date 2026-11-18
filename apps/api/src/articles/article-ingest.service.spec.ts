import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HtmlCrawlerService } from '../crawl/html-crawler.service';
import { UserKeywordsService } from '../crawl/user-keywords.service';
import { UserThemesService } from '../crawl/user-themes.service';
import { GeminiService } from '../gemini/gemini.service';
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
  summarize: (...args: unknown[]) => Promise<(Brief | null)[]>;
  focus?: string;
  queryPages?: (typeof page)[];
  collectQuery?: jest.Mock;
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
      {
        provide: UserThemesService,
        useValue: {
          listByUser: () => Promise.resolve([{ userId: USER_ID, theme: 'tech' }]),
        },
      },
      {
        provide: UserKeywordsService,
        useValue: {
          listByUser: () =>
            Promise.resolve({ focus: options.focus ?? '', exclude: [] }),
        },
      },
      {
        provide: HtmlCrawlerService,
        useValue: {
          collectThemeArticles: () => Promise.resolve(options.pages),
          collectKeywordArticles:
            options.collectQuery ??
            (() => Promise.resolve(options.queryPages ?? [])),
        },
      },
      {
        provide: GeminiService,
        useValue: {
          summarizeMany: options.summarize,
          selectInteresting: () => Promise.resolve([0]),
          expandSearchQueries: () => Promise.resolve([]),
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

  it('sends only keyword articles when the keyword has news, without theme filler', async () => {
    const collectQuery = jest.fn(() =>
      Promise.resolve([
        { ...page, link: 'https://news.example/k1', title: '카리나 새 앨범', text: '에스파 카리나가' },
        { ...page, link: 'https://news.example/k2', title: '오늘 날씨', text: '맑음' },
      ]),
    );
    const summarize = jest.fn((items: unknown) =>
      Promise.resolve(
        (items as unknown[]).map(() => ({ title: 'T', summary: 'S', interest: 5 })),
      ),
    );

    const service = await createService({
      pages: [page],
      focus: '카리나',
      collectQuery,
      summarize: summarize as unknown as (...args: unknown[]) => Promise<Brief[]>,
    });

    const saved = await service.ingestForUser(USER_ID);

    expect(collectQuery).toHaveBeenCalledWith(['카리나'], expect.any(Date));
    expect(saved.map((article) => [article.link, article.theme])).toEqual([
      ['https://news.example/k1', 'focus'],
    ]);

    const inputs = summarize.mock.calls[0][0] as { focus?: string }[];
    expect(inputs.map((input) => input.focus)).toEqual(['카리나']);
  });

  it('treats a day without keyword articles as normal and fills with theme articles', async () => {
    const service = await createService({
      pages: [page],
      focus: '카리나',
      queryPages: [],
      summarize: () =>
        Promise.resolve([{ title: 'T', summary: 'S', interest: 5 }]),
    });

    const saved = await service.ingestForUser(USER_ID);

    expect(saved.map((article) => article.theme)).toEqual(['tech']);
  });
});
