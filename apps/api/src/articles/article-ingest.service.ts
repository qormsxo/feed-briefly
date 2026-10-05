import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CrawledPage,
  HtmlCrawlerService,
} from '../crawl/html-crawler.service';
import { TECH_THEME_ID } from '../crawl/news-themes';
import { filterByKeywords } from '../crawl/keyword-filter';
import { UserKeywordsService } from '../crawl/user-keywords.service';
import { UserThemesService } from '../crawl/user-themes.service';
import { FeedsService } from '../feeds/feeds.service';
import { ArticleBrief, GeminiService } from '../gemini/gemini.service';
import { ParsedFeed, RssParserService } from '../rss/rss-parser.service';
import { Article } from './article.entity';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

const MAX_ITEMS_PER_FEED = 5;

const FALLBACK_ITEMS_PER_FEED = 3;

const MAX_BRIEFS_PER_USER = 12;

const LINKS_PER_REGISTERED_FEED = 2;

const REGISTERED_FEED_MIN_CHARS = 180;

@Injectable()
export class ArticleIngestService {
  private readonly logger = new Logger(ArticleIngestService.name);

  constructor(
    @InjectRepository(Article)
    private readonly articles: Repository<Article>,
    private readonly feeds: FeedsService,
    private readonly userThemes: UserThemesService,
    private readonly userKeywords: UserKeywordsService,
    private readonly crawler: HtmlCrawlerService,
    private readonly rss: RssParserService,
    private readonly gemini: GeminiService,
  ) {}

  ingestForUser(userId: string) {
    return this.ingest(userId);
  }

  ingestAll() {
    return this.ingest();
  }

  private async ingest(userId?: string) {
    // 일반 RSS 수집은 사용하지 않는다. 등록 API와 화면만 꺼 두었고,
    // 이미 저장된 feeds는 IT/과학 테마를 고른 경우에만 아래 collectRegisteredTechFeeds에서 읽는다.
    // const feeds = userId
    //   ? await this.feeds.listByUser(userId)
    //   : await this.feeds.listAll();
    const themeRows = userId
      ? await this.userThemes.listByUser(userId)
      : await this.userThemes.listAll();

    const since = new Date(Date.now() - LOOKBACK_MS);
    const saved: Article[] = [];

    // for (const feed of feeds) {
    //   let parsed: ParsedFeed;
    //   try {
    //     parsed = await this.rss.parse(feed.url);
    //   } catch {
    //     this.logger.warn(`피드 수집 실패 feedId=${feed.id}`);
    //     continue;
    //   }
    //
    //   const candidates = this.pickCandidates(parsed.items, since);
    //   this.logger.log(
    //     `피드 수집 url=${feed.url} candidates=${candidates.length}`,
    //   );
    //
    //   for (const item of candidates) {
    //     const duplicate = await this.articles.findOneBy({
    //       feedId: feed.id,
    //       link: item.link,
    //     });
    //     if (duplicate) {
    //       continue;
    //     }
    //
    //     const source =
    //       item.contentSnippet || item.content || item.title || '';
    //     let brief;
    //     try {
    //       brief = await this.gemini.summarize(item.title ?? '', source);
    //     } catch {
    //       this.logger.warn(`요약 실패 link=${item.link}`);
    //       continue;
    //     }
    //
    //     const article = await this.articles.save(
    //       this.articles.create({
    //         feedId: feed.id,
    //         userId: feed.userId,
    //         title: brief.title,
    //         link: item.link,
    //         summary: brief.summary,
    //         interest: brief.interest,
    //         publishedAt: this.resolvePublishedAt(item),
    //         collectedAt: new Date(),
    //       }),
    //     );
    //     saved.push(article);
    //   }
    // }

    const rowsByUser = new Map<string, typeof themeRows>();

    for (const row of themeRows) {
      const rows = rowsByUser.get(row.userId) ?? [];
      rows.push(row);
      rowsByUser.set(row.userId, rows);
    }

    const pending: PendingBrief[] = [];
    const seen = new Set<string>();

    for (const rows of rowsByUser.values()) {
      const keywords = await this.userKeywords.listByUser(rows[0].userId);
      const quotas = briefsPerTheme(rows.length, MAX_BRIEFS_PER_USER);

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const room = quotas[index];

        if (room <= 0) {
          continue;
        }

        let pages: CollectedPage[];

        try {
          pages = await this.collectThemePages(row.userId, row.theme, since);
        } catch {
          this.logger.warn(`뉴스 테마 수집 실패 theme=${row.theme}`);
          continue;
        }

        const fresh: CollectedPage[] = [];

        for (const page of pages) {
          const duplicate = await this.articles.findOneBy({
            userId: row.userId,
            link: page.link,
          });

          if (!duplicate) {
            fresh.push(page);
          }
        }

        const matched = filterByKeywords(
          fresh,
          keywords.include,
          keywords.exclude,
        );

        const picked = await this.pickInteresting(row.theme, matched, room);
        this.logger.log(
          `뉴스 테마 수집 theme=${row.theme} candidates=${fresh.length} matched=${matched.length} quota=${room} picked=${picked.length}`,
        );

        for (const page of picked) {
          const key = `${row.userId}\0${page.link}`;

          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          pending.push({ page, userId: row.userId, theme: row.theme });
        }
      }
    }

    if (pending.length > 0) {
      let briefs: (ArticleBrief | null)[] | null = null;

      try {
        briefs = await this.gemini.summarizeMany(
          pending.map((item) => ({
            title: item.page.title,
            source: item.page.text,
          })),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`요약 실패 count=${pending.length} reason=${reason}`);
      }

      if (briefs) {
        for (let index = 0; index < pending.length; index += 1) {
          const brief = briefs[index];
          const item = pending[index];

          if (!brief) {
            this.logger.warn(`요약 누락 link=${item.page.link}`);
            continue;
          }

          const article = await this.articles.save(
            this.articles.create({
              feedId: item.page.feedId,
              crawlSourceId: null,
              theme: item.theme,
              userId: item.userId,
              title: brief.title,
              link: item.page.link,
              summary: brief.summary,
              interest: brief.interest,
              publishedAt: item.page.publishedAt,
              collectedAt: new Date(),
            }),
          );

          saved.push(article);
        }
      }
    }

    this.logger.log(
      `수집 완료 userId=${userId ?? 'all'} saved=${saved.length}`,
    );

    return saved;
  }

  private async collectThemePages(
    userId: string,
    theme: string,
    since: Date,
  ): Promise<CollectedPage[]> {
    const portal = await this.crawler.collectThemeArticles(theme, since);
    const pages = portal.map((page) => ({ ...page, feedId: null }));

    if (theme !== TECH_THEME_ID) {
      return pages;
    }

    const registered = await this.collectRegisteredTechFeeds(userId, since);

    return [...pages, ...registered];
  }

  private async collectRegisteredTechFeeds(
    userId: string,
    since: Date,
  ): Promise<CollectedPage[]> {
    const feeds = await this.feeds.listByUser(userId);
    const pages: CollectedPage[] = [];

    for (const feed of feeds) {
      let parsed: ParsedFeed;

      try {
        parsed = await this.rss.parse(feed.url);
      } catch {
        this.logger.warn(`IT/과학 등록 피드 수집 실패 feedId=${feed.id}`);
        continue;
      }

      const candidates = this.pickCandidates(parsed.items, since).slice(
        0,
        LINKS_PER_REGISTERED_FEED,
      );

      const links = candidates.flatMap((item) =>
        item.link ? [item.link] : [],
      );

      const crawled = await this.crawler.collectArticlePages(links);
      const crawledLinks = new Set(crawled.map((page) => page.sourceLink));

      for (const page of crawled) {
        pages.push({ ...page, feedId: feed.id });
      }

      for (const item of candidates) {
        if (!item.link || crawledLinks.has(item.link)) {
          continue;
        }

        const text = (item.contentSnippet || item.content || '').trim();

        if (text.length < REGISTERED_FEED_MIN_CHARS) {
          continue;
        }

        pages.push({
          link: item.link,
          title: item.title ?? feed.title ?? item.link,
          text,
          publishedAt: this.resolvePublishedAt(item),
          feedId: feed.id,
        });
      }
    }

    return pages;
  }

  private async pickInteresting<T extends { title: string; text: string }>(
    theme: string,
    pages: T[],
    room: number,
  ) {
    if (pages.length <= room) {
      return pages;
    }

    try {
      const order = await this.gemini.rankByInterest(
        pages.map((page) => ({ title: page.title, lead: page.text })),
      );

      return order.slice(0, room).map((index) => pages[index]).filter(Boolean);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`흥미 순위 실패 theme=${theme} reason=${reason}`);

      return pages.slice(0, room);
    }
  }

  private pickCandidates(
    items: ParsedFeed['items'],
    since: Date,
  ): ParsedFeed['items'] {
    const withLink = items.filter((item) => Boolean(item.link));

    const recent = withLink.filter((item) => {
      const publishedAt = this.resolvePublishedAt(item);

      return !publishedAt || publishedAt >= since;
    });

    if (recent.length > 0) {
      return recent.slice(0, MAX_ITEMS_PER_FEED);
    }

    return withLink.slice(0, FALLBACK_ITEMS_PER_FEED);
  }

  private resolvePublishedAt(item: ParsedFeed['items'][number]) {
    const raw = item.isoDate ?? item.pubDate;

    if (!raw) {
      return null;
    }

    const date = new Date(raw);

    return Number.isNaN(date.getTime()) ? null : date;
  }
}

type CollectedPage = CrawledPage & {
  feedId: string | null;
};

type PendingBrief = {
  page: CollectedPage;
  userId: string;
  theme: string;
};

export function briefsPerTheme(themeCount: number, maxBriefs: number) {
  if (themeCount <= 0 || maxBriefs <= 0) {
    return [];
  }

  const base = Math.floor(maxBriefs / themeCount);
  const extra = maxBriefs % themeCount;

  return Array.from(
    { length: themeCount },
    (_, index) => base + (index < extra ? 1 : 0),
  );
}
