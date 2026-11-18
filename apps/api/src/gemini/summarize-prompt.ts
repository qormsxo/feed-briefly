export type SummarizeInput = {
  title: string;
  source: string;
  /** 요약 최대 글자 수. 카톡 200자 안에 제목·링크와 함께 들어가도록 호출 측이 정한다. */
  budget?: number;
  /** 관심 키워드로 찾은 글이면 그 키워드. 있으면 마지막 줄에 "왜 중요한지"를 붙인다. */
  focus?: string;
};

export const DEFAULT_SUMMARY_BUDGET = 160;

export const SUMMARY_TITLE_MAX = 30;

/** 모델은 총 글자 수를 잘 못 지켜서, 줄 수와 줄당 길이로 나눠서 지시한다. */
export const SUMMARY_LINE_MAX = 40;

export function summaryLineCount(budget: number): number {
  return Math.min(3, Math.max(2, Math.floor(budget / (SUMMARY_LINE_MAX + 2))));
}

/** 3줄 요약에는 기사 앞부분이면 충분하다. 한글은 대략 글자 1개당 토큰 1개. */
export const MAX_SOURCE_CHARS = 4_000;

export function buildSummarizePrompt(items: SummarizeInput[]): string {
  const blocks = items.map((item, index) => {
    const clipped = item.source.slice(0, MAX_SOURCE_CHARS);
    const budget = item.budget ?? DEFAULT_SUMMARY_BUDGET;
    const focus = item.focus?.replace(/\s+/g, ' ').trim();
    const meta = [
      `요약 ${summaryLineCount(budget)}줄, 줄마다 ${SUMMARY_LINE_MAX}자 이내`,
    ];

    if (focus) {
      meta.push(`관심 키워드: ${focus}`);
    }

    return `${index + 1}. 원제: ${item.title}\n(${meta.join(' / ')})\n${clipped}`;
  });

  return [
    '아래 글들을 각각 한국어로 정리해.',
    'JSON만 출력하고 코드블록은 쓰지 마.',
    `{"items":[{"title":"손이 가게 만드는 한국어 제목 ${SUMMARY_TITLE_MAX}자 이내","summary":"줄바꿈으로 구분한 짧은 요약","interest":8}]}`,
    'items 길이와 순서는 입력과 같아야 한다.',
    'summary는 글마다 적힌 줄 수와 줄당 글자 수(공백 포함)를 반드시 지켜. 한 줄은 한 문장, 명사형으로 짧게 끝내.',
    '"관심 키워드"가 적힌 글만 마지막 줄을 "→ "로 시작해서, 그 키워드를 챙겨 보는 사람에게 이번 소식이 왜 중요한지(무엇이 새로운지) 한 줄로 써. 관심 키워드가 없는 글에는 이 줄을 절대 쓰지 마. 이 줄도 줄 수에 포함된다.',
    'interest는 1-10. 자극적이고 화제성 있는 뉴스일수록 높게. 거짓 과장 금지.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
