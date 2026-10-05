import {
  extractGoogleNewsRssLinks,
  extractNewsArticle,
  extractNewsListingLinks,
  normalizeNewsLink,
} from './news-extract';

describe('news-extract', () => {
  it('normalizes daum and naver article urls', () => {
    expect(
      normalizeNewsLink('https://v.daum.net/v/20260921092541972?foo=1'),
    ).toBe('https://v.daum.net/v/20260921092541972');
    expect(
      normalizeNewsLink(
        'https://n.news.naver.com/mnews/article/001/0016325217?sid=100',
      ),
    ).toBe('https://n.news.naver.com/mnews/article/001/0016325217');
    expect(normalizeNewsLink('https://news.daum.net/politics')).toBeNull();
  });

  it('decodes a google news article token to the publisher url', () => {
    const publisher = 'https://www.example.com/news/story-1';
    const token = Buffer.from(`prefix${publisher}`).toString('base64url');
    const href = `https://news.google.com/rss/articles/${token}?oc=5`;
    expect(normalizeNewsLink(href)).toBe(publisher);
    const xml = `<rss><channel><link>https://news.google.com/</link><item><link>${href}</link></item></channel></rss>`;
    expect(extractGoogleNewsRssLinks(xml)).toEqual([publisher]);
  });

  it('collects portal article links from a listing page', () => {
    const html = `
      <a href="https://v.daum.net/v/20260921092541972">daum</a>
      <a href="https://n.news.naver.com/mnews/article/001/0016325217?sid=100">naver</a>
      <a href="/politics">section</a>
    `;

    expect(
      extractNewsListingLinks(html, 'https://news.daum.net/politics'),
    ).toEqual([
      'https://v.daum.net/v/20260921092541972',
      'https://n.news.naver.com/mnews/article/001/0016325217',
    ]);
  });

  it('reads naver article body and timestamp', () => {
    const html = `
      <meta property="og:title" content="본회의 결과" />
      <span class="_ARTICLE_DATE_TIME" data-date-time="2026-09-21T08:00:00+09:00"></span>
      <div id="dic_area">
        <p>첫 번째 문단입니다. 국회 본회의 결과를 자세히 전하는 문장으로 본문 길이를 채웁니다.</p>
        <p>두 번째 문단입니다. 후속 논의와 일정까지 이어서 설명해 추출이 되게 합니다.</p>
      </div>
    `;

    const article = extractNewsArticle(
      html,
      'https://n.news.naver.com/mnews/article/001/1',
    );

    expect(article.title).toBe('본회의 결과');
    expect(article.text).toContain('첫 번째 문단');
    expect(article.publishedAt?.toISOString()).toBe(
      '2026-09-20T23:00:00.000Z',
    );
  });
});
