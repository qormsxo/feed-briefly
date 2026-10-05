import { http } from '../lib/http';

export type Article = {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  collectedAt: string;
  feedTitle: string | null;
  feedUrl: string | null;
  theme: string | null;
};

export type ArticlePage = {
  items: Article[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function listArticles(page: number, limit = 10) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  return http<ArticlePage>(`/api/articles?${params.toString()}`);
}

export function ingestArticles() {
  return http<{ count: number; sent: number; kakaoError: string | null }>(
    '/api/articles/ingest',
    { method: 'POST' },
  );
}
