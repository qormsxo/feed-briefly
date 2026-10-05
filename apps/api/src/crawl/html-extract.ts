import { load } from 'cheerio';

const SKIP_PATH =
  /\/(login|signin|signup|register|tags?|categories?|authors?|search|privacy|terms|about|contact|rss|feed|wp-admin|wp-login|cart|account|share)(\/|$)/i;

export function resolveHref(href: string, pageUrl: string): string | null {
  if (
    !href ||
    href.startsWith('#') ||
    href.startsWith('javascript:') ||
    href.startsWith('mailto:')
  ) {
    return null;
  }

  try {
    const url = new URL(href, pageUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}

export function sameSite(left: string, right: string) {
  try {
    const hostA = new URL(left).hostname.replace(/^www\./, '');
    const hostB = new URL(right).hostname.replace(/^www\./, '');

    return hostA === hostB;
  } catch {
    return false;
  }
}

export function extractListingLinks(
  html: string,
  pageUrl: string,
  limit = 8,
): string[] {
  const $ = load(html);
  const scored = new Map<string, number>();

  $('a[href]').each((_, el) => {
    const href = resolveHref($(el).attr('href') ?? '', pageUrl);

    if (!href || !sameSite(href, pageUrl)) {
      return;
    }

    const url = new URL(href);

    if (url.pathname === '/' || url.pathname === '') {
      return;
    }

    if (SKIP_PATH.test(url.pathname)) {
      return;
    }

    if (
      /\.(jpg|jpeg|png|gif|svg|webp|css|js|xml|json|pdf|zip)$/i.test(
        url.pathname,
      )
    ) {
      return;
    }

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    let score = 0;

    const parent = $(el).closest(
      'article, main, [class*="post"], [class*="article"], [class*="entry"], [class*="card"], [class*="item"]',
    );

    if (parent.length) {
      score += 5;
    }

    if (text.length >= 12) {
      score += 2;
    }

    if (text.length >= 24) {
      score += 1;
    }

    if (/-/.test(url.pathname) || /\/\d{4}\//.test(url.pathname)) {
      score += 2;
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return;
    }

    if (segments.length >= 2) {
      score += 1;
    }

    const prev = scored.get(href) ?? 0;

    if (score > prev) {
      scored.set(href, score);
    }
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([href]) => href)
    .slice(0, limit);
}

export function extractSiteTitle(html: string, pageUrl: string): string | null {
  const $ = load(html);
  const og = $('meta[property="og:site_name"]').attr('content')?.trim();

  if (og) {
    return og.slice(0, 120);
  }

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();

  if (title) {
    return title.slice(0, 120);
  }

  try {
    return new URL(pageUrl).hostname;
  } catch {
    return null;
  }
}

export type ExtractedArticle = {
  title: string;
  text: string;
  publishedAt: Date | null;
};

export function extractArticle(
  html: string,
  pageUrl: string,
): ExtractedArticle {
  const $ = load(html);
  $('script, style, nav, footer, noscript, iframe, svg').remove();

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    $('title').first().text().replace(/\s+/g, ' ').trim() ||
    pageUrl;

  const publishedRaw =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').attr('datetime') ||
    $('meta[name="date"]').attr('content');

  let publishedAt: Date | null = null;

  if (publishedRaw) {
    const date = new Date(publishedRaw);

    if (!Number.isNaN(date.getTime())) {
      publishedAt = date;
    }
  }

  const containers = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-body',
    '.article-content',
    '#content',
  ];

  let text = '';

  for (const selector of containers) {
    const node = $(selector).first();

    if (!node.length) {
      continue;
    }

    const parts = node
      .find('p')
      .map((_, p) => $(p).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((part) => part.length > 40);

    if (parts.length >= 2) {
      text = parts.join('\n\n');
      break;
    }

    const block = node.text().replace(/\s+/g, ' ').trim();

    if (block.length > 200) {
      text = block;
      break;
    }
  }

  if (!text) {
    const parts = $('p')
      .map((_, p) => $(p).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((part) => part.length > 40);

    text = parts.join('\n\n');
  }

  return {
    title: title.slice(0, 300),
    text: text.slice(0, 12_000),
    publishedAt,
  };
}

export function isHtmlContentType(value: string | undefined) {
  if (!value) {
    return true;
  }

  return /text\/html|application\/xhtml/i.test(value);
}

export function isFeedContentType(value: string | undefined) {
  if (!value) {
    return false;
  }

  return /rss|atom|xml/i.test(value) && !/xhtml/i.test(value);
}
