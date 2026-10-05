import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from '../lib/http';
import { queryClient } from '../lib/query-client';
import { createFeed, deleteFeed, listFeeds } from '../feeds/api';

// 화면은 App.tsx 라우트에서 빼 두었다. 다시 켤 때는 그 주석과 상단 피드 링크를 푼다.
export function FeedsPage() {
  const [url, setUrl] = useState('');
  const feeds = useQuery({ queryKey: ['feeds'], queryFn: listFeeds });

  const createMutation = useMutation({
    mutationFn: createFeed,
    onSuccess: async () => {
      setUrl('');
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFeed,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      return;
    }

    createMutation.mutate(trimmed);
  }

  const createError =
    createMutation.error instanceof ApiError
      ? createMutation.error.message
      : createMutation.isError
        ? '등록에 실패했습니다'
        : null;

  return (
    <section>
      <h2 className="text-base font-semibold">RSS 피드</h2>
      <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
        <input
          type="url"
          required
          placeholder="https://example.com/rss.xml"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          등록
        </button>
      </form>
      {createError ? (
        <p className="mt-2 text-sm text-red-600">{createError}</p>
      ) : null}

      {feeds.isLoading ? (
        <p className="mt-6 text-sm text-slate-500">불러오는 중...</p>
      ) : null}
      {feeds.data?.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">등록된 피드가 없습니다.</p>
      ) : null}
      <ul className="mt-6 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {feeds.data?.map((feed) => (
          <li key={feed.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {feed.title ?? '제목 없음'}
              </p>
              <p className="truncate text-xs text-slate-500">{feed.url}</p>
            </div>
            <button
              type="button"
              className="shrink-0 text-sm text-slate-500 hover:text-red-600"
              onClick={() => deleteMutation.mutate(feed.id)}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
