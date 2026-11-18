import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CrawledPage,
  HtmlCrawlerService,
} from '../crawl/html-crawler.service';
import { filterByKeywords } from '../crawl/keyword-filter';
import { newsThemeLabel } from '../crawl/news-themes';
import { UserKeywordsService } from '../crawl/user-keywords.service';
import { UserThemesService } from '../crawl/user-themes.service';
import { ArticleBrief, GeminiService } from '../gemini/gemini.service';
import { Article } from './article.entity';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

const MAX_BRIEFS_PER_USER = 12;

@Injectable()
export class ArticleIngestService {
  private readonly logger = new Logger(ArticleIngestService.name);

  constructor(
    @InjectRepository(Article)
    private readonly articles: Repository<Article>,
    private readonly userThemes: UserThemesService,
    private readonly userKeywords: UserKeywordsService,
    private readonly crawler: HtmlCrawlerService,
    private readonly gemini: GeminiService,
  ) {}

  ingestForUser(userId: string) {
    return this.ingest(userId);
  }

  ingestAll() {
    return this.ingest();
  }

  private async ingest(userId?: string) {
    const themeRows = userId
      ? await this.userThemes.listByUser(userId)
      : await this.userThemes.listAll();

    if (userId && themeRows.length === 0) {
      throw new BadRequestException('관심 분야를 하나 이상 골라 주세요');
    }

    const since = new Date(Date.now() - LOOKBACK_MS);
    const collected = await this.collectPending(themeRows, since);

    if (userId) {
      this.assertCollected(collected, userId);
    }

    const saved = await this.summarizeAndSave(collected.pending);

    if (userId && collected.pending.length > 0 && saved.length === 0) {
      throw new ServiceUnavailableException(
        '요약 서비스가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요',
      );
    }

    this.logger.log(
      `수집 완료 userId=${userId ?? 'all'} saved=${saved.length}`,
    );

    return saved;
  }

  private async collectPending(
    themeRows: ThemeRow[],
    since: Date,
  ): Promise<Collected> {
    const rowsByUser = new Map<string, ThemeRow[]>();

    for (const row of themeRows) {
      const rows = rowsByUser.get(row.userId) ?? [];
      rows.push(row);
      rowsByUser.set(row.userId, rows);
    }

    const pending: PendingBrief[] = [];
    const seen = new Set<string>();
    let fetched = 0;
    let matched = 0;

    for (const rows of rowsByUser.values()) {
      const preferences = await this.userKeywords.listByUser(rows[0].userId);
      const quotas = briefsPerTheme(rows.length, MAX_BRIEFS_PER_USER);

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const room = quotas[index];

        if (room <= 0) {
          continue;
        }

        const result = await this.collectTheme(row, preferences, room, since);

        if (!result) {
          continue;
        }

        fetched += result.fetched;
        matched += result.matched;

        for (const page of result.picked) {
          const key = `${row.userId}\0${page.link}`;

          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          pending.push({ page, userId: row.userId, theme: row.theme });
        }
      }
    }

    return { pending, fetched, matched };
  }

  private async collectTheme(
    row: ThemeRow,
    preferences: UserPreferences,
    room: number,
    since: Date,
  ) {
    let pages: CollectedPage[];

    try {
      pages = await this.collectThemePages(
        row.theme,
        since,
        preferences.focus,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`뉴스 테마 수집 실패 theme=${row.theme} reason=${reason}`);

      return null;
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

    // 포함 substring hard-filter는 쓰지 않는다. 제외만 막고, 관심은 검색·선택에 반영.
    const matched = filterByKeywords(fresh, [], preferences.exclude);
    const picked = await this.pickInteresting(
      row.theme,
      matched,
      room,
      preferences.focus,
    );

    this.logger.log(
      `뉴스 테마 수집 theme=${row.theme} candidates=${fresh.length} matched=${matched.length} quota=${room} picked=${picked.length}`,
    );

    return { fetched: pages.length, matched: matched.length, picked };
  }

  /** 유저가 직접 누른 수집이 빈손이면 성공 0건 대신 화면에 보여 줄 에러로 올린다. */
  private assertCollected(collected: Collected, userId: string) {
    if (collected.fetched === 0) {
      this.logger.warn(`수집된 뉴스 없음 userId=${userId}`);

      throw new BadRequestException(
        '뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요',
      );
    }
  }

  private async summarizeAndSave(pending: PendingBrief[]): Promise<Article[]> {
    if (pending.length === 0) {
      return [];
    }

    let briefs: (ArticleBrief | null)[];

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

      return [];
    }

    const saved: Article[] = [];

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

    return saved;
  }

  private async collectThemePages(
    theme: string,
    since: Date,
    focus: string,
  ): Promise<CollectedPage[]> {
    const portal = await this.crawler.collectThemeArticles(theme, since);
    const pages = portal.map((page) => ({ ...page, feedId: null }));

    if (!focus.trim()) {
      return pages;
    }

    const queries = await this.resolveSearchQueries(theme, focus);

    if (queries.length === 0) {
      return pages;
    }

    const queried = await this.crawler.collectQueryArticles(queries, since);
    const seen = new Set(pages.map((page) => page.link));

    for (const page of queried) {
      if (seen.has(page.link)) {
        continue;
      }

      seen.add(page.link);
      pages.push({ ...page, feedId: null });
    }

    return pages;
  }

  private async resolveSearchQueries(theme: string, focus: string) {
    try {
      return await this.gemini.expandSearchQueries(
        focus,
        newsThemeLabel(theme),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `검색어 확장 실패 theme=${theme} reason=${reason}`,
      );

      return [focus.slice(0, 60)];
    }
  }

  private async pickInteresting<T extends { title: string; text: string }>(
    theme: string,
    pages: T[],
    room: number,
    focus: string,
  ) {
    if (pages.length <= room) {
      return pages;
    }

    try {
      const order = await this.gemini.selectInteresting(
        pages.map((page) => ({ title: page.title, lead: page.text })),
        room,
        theme,
        focus || undefined,
      );

      return order.slice(0, room).map((index) => pages[index]).filter(Boolean);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`흥미 선택 실패 theme=${theme} reason=${reason}`);

      return pages.slice(0, room);
    }
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

type Collected = {
  pending: PendingBrief[];
  fetched: number;
  matched: number;
};

type ThemeRow = Awaited<ReturnType<UserThemesService['listAll']>>[number];

type UserPreferences = Awaited<ReturnType<UserKeywordsService['listByUser']>>;

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
