import { load } from 'cheerio';
import { extractArticle, resolveHref } from './html-extract';

const DAUM_ARTICLE = /v\.daum\.net\/v\/(\d+)/;

const NAVER_ARTICLE = /n\.news\.naver\.com\/mnews\/article\/(\d+)\/(\d+)/;

const GOOGLE_ARTICLE = /news\.google\.com\/rss\/articles\/([^?&#]+)/;

export function extractNewsListingLinks(
  html: string,
  pageUrl: string,
  limit = 12,
): string[] {
  const $ = load(html);
  const links: string[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = resolveHref($(el).attr('href') ?? '', pageUrl);

    if (!href) {
      return;
    }

    const normalized = normalizeNewsLink(href);

    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    links.push(normalized);
  });

  return links.slice(0, limit);
}

export function normalizeNewsLink(href: string): string | null {
  const decoded = decodeGoogleNewsArticleUrl(href);
  const target = decoded ?? href;
  const daum = target.match(DAUM_ARTICLE);

  if (daum) {
    return `https://v.daum.net/v/${daum[1]}`;
  }

  const naver = target.match(NAVER_ARTICLE);

  if (naver) {
    return `https://n.news.naver.com/mnews/article/${naver[1]}/${naver[2]}`;
  }

  if (!decoded) {
    return null;
  }

  return decoded;
}

export function extractGoogleNewsRssLinks(xml: string, limit = 6): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(/<link>([^<]+)<\/link>/g)) {
    const href = match[1].replace(/&amp;/g, '&').trim();
    const normalized = normalizeNewsLink(href);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    links.push(normalized);

    if (links.length >= limit) {
      break;
    }
  }

  return links;
}

function decodeGoogleNewsArticleUrl(href: string): string | null {
  const token = href.match(GOOGLE_ARTICLE)?.[1];

  if (!token) {
    return null;
  }

  const pad = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - (pad.length % 4)) % 4);
  let text = '';

  try {
    text = Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }

  const found = firstHttpUrl(text);

  if (!found) {
    return null;
  }

  try {
    const url = new URL(found);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (/(^|\.)google\./.test(url.hostname) || url.hostname.includes('gstatic')) {
      return null;
    }

    if (url.pathname === '/' || url.pathname === '') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function firstHttpUrl(text: string) {
  const start = text.search(/https?:\/\//);

  if (start < 0) {
    return null;
  }

  let end = start;

  while (end < text.length) {
    const code = text.charCodeAt(end);
    const char = text[end];

    if (
      code < 32 ||
      char === '"' ||
      char === "'" ||
      char === '<' ||
      char === '>' ||
      char === ' '
    ) {
      break;
    }

    end += 1;
  }

  const url = text.slice(start, end);

  return url.length > 'https://'.length ? url : null;
}

export function extractNewsArticle(html: string, pageUrl: string) {
  const $ = load(html);
  $('script, style, nav, footer, noscript, iframe, svg').remove();

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('#title_area, .tit_view, h1').first().text().replace(/\s+/g, ' ').trim() ||
    $('title').first().text().replace(/\s+/g, ' ').trim() ||
    pageUrl;

  const publishedRaw =
    $('meta[property="article:published_time"]').attr('content') ||
    $('._ARTICLE_DATE_TIME').attr('data-date-time') ||
    $('meta[property="og:article:published_time"]').attr('content') ||
    $('span.num_date, .info_view span, time[datetime]').attr('datetime');

  let publishedAt: Date | null = null;

  if (publishedRaw) {
    const date = new Date(publishedRaw);

    if (!Number.isNaN(date.getTime())) {
      publishedAt = date;
    }
  }

  const portalText = collectText($, [
    '#dic_area',
    '#newsct_article',
    '._article_content',
    '.article_view',
    '#mArticle',
  ]);

  if (portalText.length >= 80) {
    return {
      title: title.slice(0, 300),
      text: portalText.slice(0, 12_000),
      publishedAt,
    };
  }

  const fallback = extractArticle(html, pageUrl);

  return {
    title: fallback.title || title,
    text: fallback.text,
    publishedAt: fallback.publishedAt ?? publishedAt,
  };
}

function collectText(
  $: ReturnType<typeof load>,
  selectors: string[],
): string {
  for (const selector of selectors) {
    const node = $(selector).first();

    if (!node.length) {
      continue;
    }

    const parts = node
      .find('p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((part) => part.length > 30);

    if (parts.length >= 2) {
      return parts.join('\n\n');
    }

    const block = node.text().replace(/\s+/g, ' ').trim();

    if (block.length > 180) {
      return block;
    }
  }

  return '';
}
