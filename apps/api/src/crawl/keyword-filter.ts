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
