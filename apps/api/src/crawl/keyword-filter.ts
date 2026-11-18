const MIN_KEYWORD_LENGTH = 2;

const MAX_KEYWORD_LENGTH = 40;

export function normalizeKeyword(raw: string): string | null {
  const word = raw.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko');

  if (word.length < MIN_KEYWORD_LENGTH || word.length > MAX_KEYWORD_LENGTH) {
    return null;
  }

  return word;
}

export function filterByKeywords<T extends { title: string; text: string }>(
  pages: T[],
  include: string[],
  exclude: string[],
): T[] {
  const includes = include.flatMap((word) => {
    const normalized = normalizeKeyword(word);

    return normalized ? [normalized] : [];
  });

  const excludes = exclude.flatMap((word) => {
    const normalized = normalizeKeyword(word);

    return normalized ? [normalized] : [];
  });

  return pages.filter((page) => {
    const haystack = `${page.title}\n${page.text}`.toLocaleLowerCase('ko');

    if (excludes.some((word) => haystack.includes(word))) {
      return false;
    }

    if (includes.length === 0) {
      return true;
    }

    return includes.some((word) => haystack.includes(word));
  });
}

export const MAX_FOCUS_KEYWORDS = 5;

/** 관심 칸 "카리나, 엔비디아"를 키워드 목록으로 나눈다. 쉼표 기준, 2~40자. */
export function focusKeywords(focus: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  for (const raw of focus.split(/[,，]/)) {
    const word = normalizeKeyword(raw);

    if (!word || seen.has(word)) {
      continue;
    }

    seen.add(word);
    words.push(word);

    if (words.length >= MAX_FOCUS_KEYWORDS) {
      break;
    }
  }

  return words;
}
