import { http } from '../lib/http';

export type Feedback = 'up' | 'down';

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
  feedback: Feedback | null;
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
  return http<{
    count: number;
    focusCount: number;
    sent: number;
    kakaoError: string | null;
    kakaoSkipped: boolean;
  }>(
    '/api/articles/ingest',
    { method: 'POST' },
  );
}

export type FeedbackResult = { articleId: string; feedback: Feedback | null };

export function setArticleFeedback(
  id: string,
  value: Feedback | null,
): Promise<FeedbackResult> {
  const path = `/api/articles/${encodeURIComponent(id)}/feedback`;

  if (value === null) {
    return http<FeedbackResult>(path, { method: 'DELETE' });
  }

  return http<FeedbackResult>(path, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}
