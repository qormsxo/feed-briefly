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
import { filterByKeywords, focusKeywords } from '../crawl/keyword-filter';
import { FOCUS_THEME_ID } from '../crawl/news-themes';
import { UserKeywordsService } from '../crawl/user-keywords.service';
import { UserThemesService } from '../crawl/user-themes.service';
import { summaryCharBudget } from '../digest/kakao-text';
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

    const add = (
      picked: CollectedPage[],
      userId: string,
      theme: string,
      focus: string,
    ) => {
      let added = 0;

      for (const page of picked) {
        const key = `${userId}\0${page.link}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        pending.push({ page, userId, theme, focus });
        added += 1;
      }

      return added;
    };

    for (const rows of rowsByUser.values()) {
      const userId = rows[0].userId;
      const preferences = await this.userKeywords.listByUser(userId);
      const keywords = focusKeywords(preferences.focus);
      let budget = MAX_BRIEFS_PER_USER;

      if (keywords.length > 0) {
        const focus = await this.collectFocus(
          userId,
          keywords,
          preferences.exclude,
          since,
        );

        if (focus) {
          fetched += focus.fetched;
          matched += focus.matched;
          add(focus.picked, userId, FOCUS_THEME_ID, keywords.join(', '));

          // 키워드를 적었으면 그 키워드 기사만 보낸다. 이미 보낸 기사뿐이어도 테마로 채우지 않는다.
          // 24시간 안에 키워드 기사가 아예 없을 때만 고른 분야 기사로 대신한다.
          if (focus.available > 0) {
            budget = 0;
          }
        }
      }

      const quotas = briefsPerTheme(rows.length, budget);

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const room = quotas[index] ?? 0;

        if (room <= 0) {
          continue;
        }

        const result = await this.collectTheme(row, preferences, room, since);

        if (!result) {
          continue;
        }

        fetched += result.fetched;
        matched += result.matched;
        add(result.picked, userId, row.theme, '');
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
      const portal = await this.crawler.collectThemeArticles(row.theme, since);
      pages = portal.map((page) => ({ ...page, feedId: null }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`뉴스 테마 수집 실패 theme=${row.theme} reason=${reason}`);

      return null;
    }

    const fresh = await this.dropKnown(row.userId, pages);
    const matched = filterByKeywords(fresh, [], preferences.exclude);
    const picked = await this.pickInteresting(row.theme, matched, room);

    this.logger.log(
      `뉴스 테마 수집 theme=${row.theme} candidates=${fresh.length} matched=${matched.length} quota=${room} picked=${picked.length}`,
    );

    return { fetched: pages.length, matched: matched.length, picked };
  }

  /**
   * 관심 키워드는 테마와 섞지 않고 사용자당 한 번, 키워드 그대로 다음 뉴스에서 검색한다.
   * 본문·제목에 키워드가 실제로 들어간 글만 남긴다. available은 이미 보낸 글까지 포함한 24시간 내 키워드 기사 수다.
   */
  private async collectFocus(
    userId: string,
    keywords: string[],
    exclude: string[],
    since: Date,
  ) {
    let pages: CollectedPage[];

    try {
      const found = await this.crawler.collectKeywordArticles(keywords, since);
      pages = found.map((page) => ({ ...page, feedId: null }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`관심 키워드 수집 실패 userId=${userId} reason=${reason}`);

      return null;
    }

    const available = filterByKeywords(pages, keywords, exclude).length;
    const fresh = await this.dropKnown(userId, pages);
    const matched = filterByKeywords(fresh, keywords, exclude);

    if (matched.length === 0) {
      // 24시간 안에 키워드 기사가 없는 날은 흔하다. 에러가 아니라 0건으로 넘기고 자리는 테마 기사에 준다.
      this.logger.log(
        `관심 키워드 기사 없음 keywords=${keywords.join('|')} candidates=${fresh.length}`,
      );

      return { fetched: pages.length, matched: 0, picked: [], available };
    }

    const picked = await this.pickInteresting(
      FOCUS_THEME_ID,
      matched,
      MAX_BRIEFS_PER_USER,
    );

    this.logger.log(
      `관심 키워드 수집 keywords=${keywords.join('|')} candidates=${fresh.length} matched=${matched.length} picked=${picked.length}`,
    );

    return { fetched: pages.length, matched: matched.length, picked, available };
  }

  private async dropKnown(userId: string, pages: CollectedPage[]) {
    const fresh: CollectedPage[] = [];

    for (const page of pages) {
      const duplicate = await this.articles.findOneBy({
        userId,
        link: page.link,
      });

      if (!duplicate) {
        fresh.push(page);
      }
    }

    return fresh;
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
          budget: summaryCharBudget(item.page.link),
          focus: item.focus || undefined,
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

  private async pickInteresting<T extends { title: string; text: string }>(
    theme: string,
    pages: T[],
    room: number,
  ) {
    if (pages.length <= room) {
      return pages;
    }

    try {
      const order = await this.gemini.selectInteresting(
        pages.map((page) => ({ title: page.title, lead: page.text })),
        room,
        theme,
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
  focus: string;
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
