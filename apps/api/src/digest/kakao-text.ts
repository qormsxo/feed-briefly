export const KAKAO_TEXT_MAX = 200;

/** 카톡 제목 길이 상한. 요약 예산을 계산할 때도 같은 값을 쓴다. */
export const KAKAO_TITLE_MAX = 30;

const MIN_SUMMARY_BUDGET = 40;

const MAX_SUMMARY_BUDGET = 160;

/**
 * 제목 + 원문 링크를 뺀 나머지 글자 수. 요약을 이 안에 맞추면 카톡에서 잘리지 않는다.
 * buildKakaoText의 구분자(\n\n)와 말줄임표 여유분까지 뺀다.
 */
export function summaryCharBudget(originalUrl: string): number {
  const url = originalUrl.trim();
  const linkBlock = url ? url.length + 2 : 0;
  const budget = KAKAO_TEXT_MAX - KAKAO_TITLE_MAX - 2 - linkBlock - 1;

  return Math.min(MAX_SUMMARY_BUDGET, Math.max(MIN_SUMMARY_BUDGET, budget));
}

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

  // 넘치면 문장 중간에서 자르기보다 뒤쪽 줄부터 통째로 뺀다.
  const kept: string[] = [];

  for (const line of body.split('\n').map((part) => part.trim()).filter(Boolean)) {
    const candidate = `${heading}\n\n${[...kept, line].join('\n')}${linkBlock}`;

    if (candidate.length > KAKAO_TEXT_MAX) {
      break;
    }

    kept.push(line);
  }

  if (kept.length > 0) {
    return `${heading}\n\n${kept.join('\n')}${linkBlock}`;
  }

  const budget = KAKAO_TEXT_MAX - heading.length - 2 - linkBlock.length - 1;

  if (budget < 8) {
    return withoutBody;
  }

  return `${heading}\n\n${body.slice(0, budget)}…${linkBlock}`;
}
