import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { withRetry } from '../common/retry';
import { isPlainRecord, isString } from '../common/parse';
import {
  extractListingLinks,
  extractSiteTitle,
  isFeedContentType,
  isHtmlContentType,
} from './html-extract';
import {
  extractGoogleNewsRssLinks,
  extractNewsArticle,
  extractNewsListingLinks,
} from './news-extract';
import { getNewsTheme } from './news-themes';

const FETCH_TIMEOUT_MS = 10_000;

const MAX_BODY_BYTES = 1_500_000;

const LISTING_LINK_LIMIT = 12;

const PER_LISTING = 2;

const MAX_ITEMS = 4;

const FALLBACK_ITEMS = 3;

const MIN_TEXT_CHARS = 180;

const FETCH_GAP_MS = 250;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export type CrawledPage = {
  link: string;
  title: string;
  text: string;
  publishedAt: Date | null;
};

export type FetchedPage = CrawledPage & {
  sourceLink: string;
};

@Injectable()
export class HtmlCrawlerService {
  private readonly logger = new Logger(HtmlCrawlerService.name);

  async assertCrawlableListing(url: string) {
    const { html, finalUrl } = await this.fetchHtml(url, '목록 확인');
    const links = extractListingLinks(html, finalUrl, LISTING_LINK_LIMIT);

    if (links.length === 0) {
      throw new BadRequestException(
        '글 목록을 찾지 못했습니다. 블로그나 뉴스 글 목록 URL을 넣어 주세요',
      );
    }

    return {
      title: extractSiteTitle(html, finalUrl),
      linkCount: links.length,
    };
  }

  async collectThemeArticles(
    themeId: string,
    since: Date,
  ): Promise<CrawledPage[]> {
    const theme = getNewsTheme(themeId);

    if (!theme) {
      return [];
    }

    const seen = new Set<string>();
    const buckets: string[][] = [];

    for (const listing of theme.listings) {
      try {
        const found = await this.listArticles(listing);
        const bucket: string[] = [];

        for (const link of found) {
          if (seen.has(link)) {
            continue;
          }

          seen.add(link);
          bucket.push(link);

          if (bucket.length >= PER_LISTING) {
            break;
          }
        }

        if (bucket.length > 0) {
          buckets.push(bucket);
        }
      } catch {
        this.logger.warn(`뉴스 목록 실패 theme=${themeId} url=${listing}`);
      }
    }

    const links = takeRoundRobin(
      buckets,
      PER_LISTING,
      buckets.reduce((count, bucket) => count + bucket.length, 0),
    );

    const collected: CrawledPage[] = [];

    for (const link of links) {
      try {
        const page = await this.fetchArticle(link);

        if (page.text.length < MIN_TEXT_CHARS) {
          continue;
        }

        collected.push(page);
      } catch {
        this.logger.warn(`뉴스 글 실패 link=${link}`);
      }

      await sleep(FETCH_GAP_MS);
    }

    return this.pickRecent(collected, since, collected.length);
  }

  async collectArticles(url: string, since: Date): Promise<CrawledPage[]> {
    const { html, finalUrl } = await this.fetchHtml(url, '목록 수집');

    const links = [
      ...extractNewsListingLinks(html, finalUrl, LISTING_LINK_LIMIT),
      ...extractListingLinks(html, finalUrl, LISTING_LINK_LIMIT),
    ].filter((link, index, all) => all.indexOf(link) === index);

    const collected: CrawledPage[] = [];

    for (const link of links) {
      try {
        const page = await this.fetchArticle(link);

        if (page.text.length < MIN_TEXT_CHARS) {
          continue;
        }

        collected.push(page);
      } catch {
        this.logger.warn(`글 수집 실패 link=${link}`);
      }
    }

    return this.pickRecent(collected, since);
  }

  async collectArticlePages(links: string[]): Promise<FetchedPage[]> {
    const collected: FetchedPage[] = [];

    for (const link of links) {
      try {
        const page = await this.fetchArticle(link);

        if (page.text.length < MIN_TEXT_CHARS) {
          continue;
        }

        collected.push({ ...page, sourceLink: link });
      } catch {
        this.logger.warn(`뉴스 글 실패 link=${link}`);
      }

      await sleep(FETCH_GAP_MS);
    }

    return collected;
  }

  private pickRecent(items: CrawledPage[], since: Date, limit = MAX_ITEMS) {
    const recent = items.filter(
      (item) => !item.publishedAt || item.publishedAt >= since,
    );

    if (recent.length > 0) {
      return recent.slice(0, limit);
    }

    return items.slice(0, Math.min(limit, FALLBACK_ITEMS));
  }

  private async listArticles(listing: string) {
    if (isGoogleNewsRss(listing)) {
      const { html } = await this.fetchHtml(listing, '구글 뉴스', 2, true);

      return extractGoogleNewsRssLinks(html, PER_LISTING + 2);
    }

    const { html, finalUrl } = await this.fetchHtml(listing, '뉴스 목록');

    return extractNewsListingLinks(html, finalUrl, LISTING_LINK_LIMIT);
  }

  private async fetchArticle(url: string): Promise<CrawledPage> {
    const { html, finalUrl } = await this.fetchHtml(url, '글 수집', 1);
    const extracted = extractNewsArticle(html, finalUrl);

    return {
      link: finalUrl,
      title: extracted.title,
      text: extracted.text,
      publishedAt: extracted.publishedAt,
    };
  }

  private async fetchHtml(
    url: string,
    label: string,
    retries = 2,
    allowFeed = false,
  ) {
    const response = await withRetry(
      `${label} url=${url}`,
      () =>
        axios.get<string>(url, {
          timeout: FETCH_TIMEOUT_MS,
          maxContentLength: MAX_BODY_BYTES,
          maxRedirects: 3,
          responseType: 'text',
          transitional: { forcedJSONParsing: false },
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'User-Agent': USER_AGENT,
          },
          validateStatus: (status) => status >= 200 && status < 400,
        }),
      { retries, delayMs: 300, logger: this.logger },
    );

    const contentType = String(response.headers['content-type'] ?? '');

    if (isFeedContentType(contentType) && !allowFeed) {
      throw new BadRequestException(
        'RSS/Atom 주소입니다. RSS 피드로 등록해 주세요',
      );
    }

    if (!allowFeed && !isHtmlContentType(contentType)) {
      throw new BadRequestException('HTML 페이지가 아닙니다');
    }

    return {
      html: response.data,
      finalUrl: responseFinalUrl(response, url),
    };
  }
}

export function takeRoundRobin(
  buckets: string[][],
  perBucket: number,
  limit: number,
) {
  const links: string[] = [];

  for (let index = 0; index < perBucket && links.length < limit; index += 1) {
    for (const bucket of buckets) {
      if (links.length >= limit) {
        break;
      }

      const link = bucket[index];

      if (link) {
        links.push(link);
      }
    }
  }

  return links;
}

function isGoogleNewsRss(url: string) {
  try {
    const parsed = new URL(url);

    return (
      parsed.hostname === 'news.google.com' && parsed.pathname.startsWith('/rss')
    );
  } catch {
    return false;
  }
}

function responseFinalUrl(response: AxiosResponse<string>, fallback: string) {
  const request = response.request;

  if (!isPlainRecord(request) || !('res' in request)) {
    return fallback;
  }

  const res = request.res;

  if (!isPlainRecord(res) || !('responseUrl' in res) || !isString(res.responseUrl)) {
    return fallback;
  }

  return res.responseUrl || fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function crawlErrorMessage(error: Error) {
  if (error instanceof BadRequestException) {
    return error;
  }

  if (error instanceof AxiosError) {
    return new BadRequestException('사이트를 가져오지 못했습니다');
  }

  return error;
}
