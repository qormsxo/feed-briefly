import { isPlainRecord, isString } from '../common/parse';

export const MAX_SEARCH_QUERIES = 3;

export function buildExpandSearchQueriesPrompt(focus: string, themeLabel: string) {
  return [
    '아침 뉴스 검색 쿼리를 만들어라.',
    `관심: ${focus}`,
    `테마 시드: ${themeLabel}`,
    '한국어 구글 뉴스 검색어로 쓸 짧은 쿼리만 만든다.',
    `JSON만 출력하고 코드블록은 쓰지 마. {"queries":["쿼리1","쿼리2"]}`,
    `queries는 1~${MAX_SEARCH_QUERIES}개. 테마와 관심을 겹치게 구체화하고, 중복·빈 문자열 금지.`,
  ].join('\n');
}

export function parseSearchQueries(raw: string): string[] | null {
  const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isPlainRecord(parsed) || !('queries' in parsed) || !Array.isArray(parsed.queries)) {
    return null;
  }

  const seen = new Set<string>();
  const queries: string[] = [];

  for (const item of parsed.queries) {
    if (!isString(item)) {
      continue;
    }

    const query = item.replace(/\s+/g, ' ').trim();

    if (query.length < 2 || query.length > 60) {
      continue;
    }

    const key = query.toLocaleLowerCase('ko');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    queries.push(query);

    if (queries.length >= MAX_SEARCH_QUERIES) {
      break;
    }
  }

  return queries.length > 0 ? queries : null;
}
