export const KAKAO_TEXT_MAX = 200;

export type RankableArticle = {
  interest: number;
  collectedAt: Date;
};

export function sortByInterest<T extends RankableArticle>(articles: T[]): T[] {
  return [...articles].sort((left, right) => {
    const interestDiff = right.interest - left.interest;

    if (interestDiff !== 0) {
      return interestDiff;
    }

    return right.collectedAt.getTime() - left.collectedAt.getTime();
  });
}

export function buildKakaoText(
  title: string,
  summary: string,
  originalUrl: string,
): string {
  const heading = title.trim();
  const body = summary.trim();
  const url = originalUrl.trim();
  const linkBlock = url ? `\n\n${url}` : '';

  const withoutBody = `${heading}${linkBlock}`;

  if (withoutBody.length >= KAKAO_TEXT_MAX) {
    return withoutBody.slice(0, KAKAO_TEXT_MAX);
  }

  if (!body) {
    return withoutBody;
  }

  const full = `${heading}\n\n${body}${linkBlock}`;

  if (full.length <= KAKAO_TEXT_MAX) {
    return full;
  }

  const budget = KAKAO_TEXT_MAX - heading.length - 2 - linkBlock.length - 1;

  if (budget < 8) {
    return withoutBody;
  }

  return `${heading}\n\n${body.slice(0, budget)}…${linkBlock}`;
}
