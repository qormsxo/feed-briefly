import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isNumber, isPlainRecord, isString } from '../common/parse';
import { isDailyQuotaError, withRetry } from '../common/retry';

/** gemini-3.8-flash 입력 한도. https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash */
const MODEL_INPUT_TOKEN_LIMIT = 1_048_576;

/**
 * 3줄 요약에는 기사 앞부분이면 충분하다.
 * 한글은 대략 글자 1개당 토큰 1개라, 4,000자는 모델 한도보다 훨씬 짧다.
 */
const MAX_SOURCE_CHARS = Math.min(4_000, MODEL_INPUT_TOKEN_LIMIT);

export type ArticleBrief = {
  title: string;
  summary: string;
  interest: number;
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(config: ConfigService) {
    this.client = new GoogleGenerativeAI(config.getOrThrow('GEMINI_API_KEY'));
    this.modelName = config.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  }

  async summarize(title: string, source: string): Promise<ArticleBrief> {
    const [brief] = await this.summarizeMany([{ title, source }]);

    if (!brief) {
      throw new Error('요약 JSON 파싱 실패');
    }

    return brief;
  }

  async summarizeMany(
    items: { title: string; source: string }[],
  ): Promise<(ArticleBrief | null)[]> {
    if (items.length === 0) {
      return [];
    }

    const model = this.client.getGenerativeModel({ model: this.modelName });

    const blocks = items.map((item, index) => {
      const clipped = item.source.slice(0, MAX_SOURCE_CHARS);

      return `${index + 1}. 원제: ${item.title}\n${clipped}`;
    });

    const prompt = [
      '아래 글들을 각각 한국어로 정리해.',
      'JSON만 출력하고 코드블록은 쓰지 마.',
      '{"items":[{"title":"손이 가게 만드는 한국어 제목","summary":"세 줄 요약. 줄바꿈 구분. 전체 160자 이내","interest":8}]}',
      'items 길이와 순서는 입력과 같아야 한다.',
      'interest는 1-10. 자극적이고 화제성 있는 뉴스일수록 높게. 거짓 과장 금지.',
      '',
      blocks.join('\n\n'),
    ].join('\n');

    const result = await withRetry(
      `Gemini 요약 count=${items.length}`,
      () => model.generateContent(prompt),
      { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
    );

    const text = result.response.text().trim();

    const briefs = parseSummaries(
      text,
      items.map((item) => item.title),
    );

    if (!briefs) {
      throw new Error('요약 JSON 파싱 실패');
    }

    return briefs;
  }

  async rankByInterest(
    items: { title: string; lead: string }[],
  ): Promise<number[]> {
    if (items.length <= 1) {
      return items.map((_, index) => index);
    }

    const model = this.client.getGenerativeModel({ model: this.modelName });

    const lines = items.map((item, index) => {
      const lead = item.lead.replace(/\s+/g, ' ').trim().slice(0, 160);

      return `${index}. ${item.title}\n${lead}`;
    });

    const prompt = [
      '아래 뉴스를 자극적이고 화제성 있는 순으로 점수를 매겨.',
      'JSON만 출력하고 코드블록은 쓰지 마.',
      `{"scores":[${items.map(() => 5).join(',')}]}`,
      'scores 길이는 후보 수와 같아야 하고, 순서는 입력 순서를 유지해.',
      '점수는 1-10. 재미와 화제성이 높을수록 높게. 거짓 과장 금지.',
      '',
      lines.join('\n\n'),
    ].join('\n');

    const result = await withRetry(
      `Gemini 흥미 순위 count=${items.length}`,
      () => model.generateContent(prompt),
      { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
    );

    const text = result.response.text().trim();
    const scores = parseInterestScores(text, items.length);

    if (!scores) {
      throw new Error('흥미 순위 JSON 파싱 실패');
    }

    return orderByInterestScores(scores);
  }

}

export function parseSummaries(
  raw: string,
  fallbackTitles: string[],
): (ArticleBrief | null)[] | null {
  const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  const items = Array.isArray(parsed)
    ? parsed
    : isSummaryEnvelope(parsed)
      ? parsed.items
      : null;

  if (!items) {
    return null;
  }

  return fallbackTitles.map((title, index) => {
    const fields = items[index];

    return parseBriefItem(isBriefFields(fields) ? fields : undefined, title);
  });
}

type BriefFields = {
  title?: string;
  summary?: string;
  interest?: number | string;
};

type SummaryEnvelope = {
  items: unknown[];
};

function isSummaryEnvelope(value: unknown): value is SummaryEnvelope {
  return isPlainRecord(value) && 'items' in value && Array.isArray(value.items);
}

function isBriefFields(value: unknown): value is BriefFields {
  if (!isPlainRecord(value)) {
    return false;
  }

  if ('title' in value && value.title !== undefined && !isString(value.title)) {
    return false;
  }

  if (
    'summary' in value &&
    value.summary !== undefined &&
    !isString(value.summary)
  ) {
    return false;
  }

  if (
    'interest' in value &&
    value.interest !== undefined &&
    !isNumber(value.interest) &&
    !isString(value.interest)
  ) {
    return false;
  }

  return true;
}

function parseBriefItem(
  parsed: BriefFields | undefined,
  fallbackTitle: string,
): ArticleBrief | null {
  const summary = parsed?.summary?.trim() ?? '';

  if (!summary) {
    return null;
  }

  const translated = parsed?.title?.trim() ?? '';

  return {
    title: translated || fallbackTitle,
    summary,
    interest: clampInterest(parsed?.interest),
  };
}

export function parseInterestScores(
  raw: string,
  count: number,
): number[] | null {
  const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isScoreEnvelope(parsed, count)) {
    return null;
  }

  return parsed.scores.map((score) => {
    if (isNumber(score)) {
      return finiteNumber(score);
    }

    if (isString(score)) {
      return finiteNumber(Number(score));
    }

    return 0;
  });
}

type ScoreEnvelope = {
  scores: unknown[];
};

function isScoreEnvelope(value: unknown, count: number): value is ScoreEnvelope {
  return (
    isPlainRecord(value) &&
    'scores' in value &&
    Array.isArray(value.scores) &&
    value.scores.length === count
  );
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function orderByInterestScores(scores: number[]): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.index);
}

function clampInterest(value: number | string | undefined): number {
  if (value === undefined) {
    return 5;
  }

  const parsed = isNumber(value) ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(parsed)));
}
