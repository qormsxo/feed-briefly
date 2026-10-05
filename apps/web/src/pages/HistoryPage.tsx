import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ingestArticles, listArticles } from '../articles/api';
import { ApiError } from '../lib/http';
import { queryClient } from '../lib/query-client';
import {
  listKeywords,
  listThemes,
  saveKeywords,
  saveThemes,
  type UserKeywords,
} from '../themes/api';

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const themes = useQuery({ queryKey: ['themes'], queryFn: listThemes });
  const keywords = useQuery({ queryKey: ['keywords'], queryFn: listKeywords });

  const saveMutation = useMutation({
    mutationFn: saveThemes,
    onSuccess: (data) => {
      queryClient.setQueryData(['themes'], data);
    },
  });

  const keywordMutation = useMutation({
    mutationFn: saveKeywords,
    onSuccess: (data) => {
      queryClient.setQueryData(['keywords'], data);
    },
  });

  const ingestMutation = useMutation({
    mutationFn: ingestArticles,
    onSuccess: async () => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });

  const history = useQuery({
    queryKey: ['articles', page],
    queryFn: () => listArticles(page),
    refetchInterval: ingestMutation.isPending ? 1500 : false,
  });

  const selected = new Set(themes.data?.selected ?? []);
  const items = history.data?.items ?? [];
  const ingestResult = ingestMutation.data;

  const saveError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.isError
        ? '저장에 실패했습니다'
        : null;

  const keywordError =
    keywordMutation.error instanceof ApiError
      ? keywordMutation.error.message
      : keywordMutation.isError
        ? '키워드 저장에 실패했습니다'
        : null;

  const keywordValue = keywords.data ?? { include: [], exclude: [] };

  function changeKeywords(next: UserKeywords) {
    keywordMutation.mutate(next);
  }

  function toggle(id: string) {
    const next = new Set(selected);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    saveMutation.mutate([...next]);
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {themes.isLoading ? (
            <p className="text-sm text-zinc-300">분야를 불러오는 중...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {themes.data?.catalog.map((theme) => {
                const on = selected.has(theme.id);

                return (
                  <button
                    key={theme.id}
                    type="button"
                    disabled={saveMutation.isPending}
                    className={`rounded-lg px-2.5 py-1 text-[13px] font-medium disabled:opacity-60 ${
                      on
                        ? 'bg-teal-500 text-black'
                        : 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:text-white'
                    }`}
                    onClick={() => toggle(theme.id)}
                  >
                    {theme.label}
                  </button>
                );
              })}
            </div>
          )}
          {saveError ? (
            <p className="mt-3 text-sm text-red-400">{saveError}</p>
          ) : null}
          <KeywordField
            label="포함"
            hint="포함할 키워드"
            words={keywordValue.include}
            disabled={keywords.isLoading || keywordMutation.isPending}
            onAdd={(words) =>
              changeKeywords({
                include: [...keywordValue.include, ...words],
                exclude: keywordValue.exclude,
              })
            }
            onRemove={(word) =>
              changeKeywords({
                include: keywordValue.include.filter((item) => item !== word),
                exclude: keywordValue.exclude,
              })
            }
          />
          <KeywordField
            label="제외"
            hint="제외할 키워드"
            words={keywordValue.exclude}
            disabled={keywords.isLoading || keywordMutation.isPending}
            onAdd={(words) =>
              changeKeywords({
                include: keywordValue.include,
                exclude: [...keywordValue.exclude, ...words],
              })
            }
            onRemove={(word) =>
              changeKeywords({
                include: keywordValue.include,
                exclude: keywordValue.exclude.filter((item) => item !== word),
              })
            }
          />
          {keywordError ? (
            <p className="mt-3 text-sm text-red-400">{keywordError}</p>
          ) : null}
          {selected.size === 0 && themes.data ? (
            <p className="mt-3 text-[13px] text-zinc-300">
              분야를 하나 이상 고르면 그 뉴스를 모읍니다.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={ingestMutation.isPending}
          className="h-9 shrink-0 rounded-lg bg-teal-500 px-3.5 text-[13px] font-medium text-black disabled:opacity-50"
          onClick={() => ingestMutation.mutate()}
        >
          {ingestMutation.isPending ? '수집 중' : '지금 수집'}
        </button>
      </div>

      {ingestMutation.isPending ? (
        <p className="mt-6 flex items-center gap-2.5 text-sm text-zinc-300">
          <span
            aria-hidden
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-teal-400"
          />
          요약이 끝나는 대로 아래에 추가됩니다. 끝나면 카카오톡으로도 보냅니다.
        </p>
      ) : null}
      {ingestResult && !ingestMutation.isPending ? (
        <p className="mt-6 text-sm text-zinc-300">
          새로 요약 {ingestResult.count}건, 카카오톡 {ingestResult.sent}건
          {ingestResult.kakaoError ? ` (발송 실패: ${ingestResult.kakaoError})` : ''}
        </p>
      ) : null}

      {history.isLoading ? (
        <p className="mt-8 text-sm text-zinc-300">불러오는 중...</p>
      ) : null}
      {history.data && items.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-300">아직 요약이 없습니다.</p>
      ) : null}

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((article) => (
          <li key={article.id} className="h-full">
            <a
              href={article.link}
              target="_blank"
              rel="noreferrer"
              className="group block h-full rounded-xl bg-zinc-950 px-5 py-5 ring-1 ring-zinc-800 transition duration-200 hover:-translate-y-0.5 hover:bg-[#171c26] hover:ring-teal-400/80 hover:shadow-lg hover:shadow-black/40"
            >
              <div className="flex items-baseline justify-between gap-3 text-[12px] text-zinc-300">
                <p>
                  {article.theme
                    ? article.feedTitle ?? article.theme
                    : article.feedTitle ?? article.feedUrl ?? '피드'}
                </p>
                <time dateTime={article.collectedAt}>
                  {new Date(article.collectedAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-2 text-[17px] font-semibold leading-6 tracking-tight text-zinc-50 transition group-hover:text-teal-300">
                {article.title}
              </p>
              <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-zinc-300">
                {article.summary}
              </p>
            </a>
          </li>
        ))}
      </ul>

      {history.data && history.data.total > 0 ? (
        <div className="mt-6 flex items-center justify-between text-[13px] text-zinc-200">
          <button
            type="button"
            disabled={page <= 1}
            className="disabled:opacity-40"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(history.data.total / history.data.limit))}
          </span>
          <button
            type="button"
            disabled={!history.data.hasMore}
            className="disabled:opacity-40"
            onClick={() => setPage((current) => current + 1)}
          >
            다음
          </button>
        </div>
      ) : null}
    </section>
  );
}

function KeywordField({
  label,
  hint,
  words,
  disabled,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  words: string[];
  disabled: boolean;
  onAdd: (words: string[]) => void;
  onRemove: (word: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit(event?: FormEvent) {
    event?.preventDefault();

    const next = draft
      .split(/[,，]/)
      .map((word) => word.trim())
      .filter(Boolean);

    if (next.length === 0) {
      return;
    }

    onAdd(next);
    setDraft('');
  }

  return (
    <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={commit}>
      <span className="text-[12px] text-zinc-300">{label}</span>
      {words.map((word) => (
        <button
          key={word}
          type="button"
          disabled={disabled}
          className="rounded-lg bg-zinc-900 px-2 py-1 text-[13px] text-zinc-100 ring-1 ring-zinc-700 disabled:opacity-60"
          onClick={() => onRemove(word)}
        >
          {word} ×
        </button>
      ))}
      <input
        value={draft}
        disabled={disabled}
        placeholder={hint}
        className="h-8 w-40 rounded-lg bg-zinc-900 px-2.5 text-[13px] text-zinc-100 ring-1 ring-zinc-700 outline-none placeholder:text-zinc-400 disabled:opacity-60"
        onChange={(event) => setDraft(event.target.value)}
      />
    </form>
  );
}
