import {
  FunctionCallingMode,
  FunctionCall,
  GoogleGenerativeAI,
  Part,
} from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from '../common/circuit-breaker';
import { isNumber, isPlainRecord, isString } from '../common/parse';
import { isDailyQuotaError, withRetry } from '../common/retry';
import {
  buildExpandSearchQueriesPrompt,
  parseSearchQueries,
} from './expand-search-queries';
import {
  buildSelectInterestingPrompt,
  inspectCandidatePayload,
  parseInspectIndex,
  parseSelectIndices,
  SELECT_INTERESTING_MAX_STEPS,
  selectInterestingTool,
  SelectInterestingCandidate,
} from './select-interesting';

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
  private readonly circuit = new CircuitBreaker('Gemini');

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

    const result = await this.circuit.exec(() =>
      withRetry(
        `Gemini 요약 count=${items.length}`,
        () => model.generateContent(prompt),
        { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
      ),
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

    const result = await this.circuit.exec(() =>
      withRetry(
        `Gemini 흥미 순위 count=${items.length}`,
        () => model.generateContent(prompt),
        { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
      ),
    );

    const text = result.response.text().trim();
    const scores = parseInterestScores(text, items.length);

    if (!scores) {
      throw new Error('흥미 순위 JSON 파싱 실패');
    }

    return orderByInterestScores(scores);
  }

  /** 관심 한 줄 + 테마 시드로 구글 뉴스 검색어를 만든다. */
  async expandSearchQueries(
    focus: string,
    themeLabel: string,
  ): Promise<string[]> {
    const trimmed = focus.replace(/\s+/g, ' ').trim();

    if (!trimmed) {
      return [];
    }

    const model = this.client.getGenerativeModel({ model: this.modelName });
    const prompt = buildExpandSearchQueriesPrompt(trimmed, themeLabel);

    const result = await this.circuit.exec(() =>
      withRetry(
        `Gemini 검색어 확장 theme=${themeLabel}`,
        () => model.generateContent(prompt),
        { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
      ),
    );

    const queries = parseSearchQueries(result.response.text().trim());

    if (!queries) {
      throw new Error('검색어 JSON 파싱 실패');
    }

    return queries;
  }

  /**
   * 후보가 쿼터보다 많을 때 tool calling으로 고른다.
   * inspect_candidate → select_briefs 루프. 실패 시 rankByInterest로 폴백.
   */
  async selectInteresting(
    items: SelectInterestingCandidate[],
    room: number,
    theme?: string,
    focus?: string,
  ): Promise<number[]> {
    if (items.length <= room) {
      return items.map((_, index) => index);
    }

    if (room <= 0) {
      return [];
    }

    try {
      const selected = await this.runSelectInterestingAgent(
        items,
        room,
        theme,
        focus,
      );

      if (selected) {
        return selected;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `흥미 선택 에이전트 실패 theme=${theme ?? '-'} reason=${reason}`,
      );
    }

    return this.rankByInterest(items);
  }

  private async runSelectInterestingAgent(
    items: SelectInterestingCandidate[],
    room: number,
    theme?: string,
    focus?: string,
  ): Promise<number[] | null> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      tools: [selectInterestingTool],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      },
    });

    const chat = model.startChat();
    const prompt = buildSelectInterestingPrompt(items, room, theme, focus);

    let result = await this.circuit.exec(() =>
      withRetry(
        `Gemini 흥미 선택 start count=${items.length} room=${room}`,
        () => chat.sendMessage(prompt),
        { logger: this.logger, retryOn: (error) => !isDailyQuotaError(error) },
      ),
    );

    for (let step = 0; step < SELECT_INTERESTING_MAX_STEPS; step += 1) {
      const calls = result.response.functionCalls();

      if (!calls || calls.length === 0) {
        this.logger.warn(
          `흥미 선택 도구 호출 없음 step=${step} theme=${theme ?? '-'}`,
        );

        return null;
      }

      const responseParts: Part[] = [];
      let selected: number[] | null = null;

      for (const call of calls) {
        const handled = this.handleSelectInterestingCall(call, items, room);
        responseParts.push(handled.part);

        if (handled.selected) {
          selected = handled.selected;
        }
      }

      if (selected) {
        return selected;
      }

      result = await this.circuit.exec(() =>
        withRetry(
          `Gemini 흥미 선택 step=${step + 1}`,
          () => chat.sendMessage(responseParts),
          {
            logger: this.logger,
            retryOn: (error) => !isDailyQuotaError(error),
          },
        ),
      );
    }

    this.logger.warn(
      `흥미 선택 스텝 초과 theme=${theme ?? '-'} max=${SELECT_INTERESTING_MAX_STEPS}`,
    );

    return null;
  }

  private handleSelectInterestingCall(
    call: FunctionCall,
    items: SelectInterestingCandidate[],
    room: number,
  ): { part: Part; selected: number[] | null } {
    if (call.name === 'inspect_candidate') {
      const parsed = parseInspectIndex(call.args, items.length);

      if (!parsed.ok) {
        return {
          part: functionResponsePart(call.name, { error: parsed.error }),
          selected: null,
        };
      }

      return {
        part: functionResponsePart(
          call.name,
          inspectCandidatePayload(items[parsed.index], parsed.index),
        ),
        selected: null,
      };
    }

    if (call.name === 'select_briefs') {
      const parsed = parseSelectIndices(call.args, items.length, room);

      if (!parsed.ok) {
        return {
          part: functionResponsePart(call.name, { error: parsed.error }),
          selected: null,
        };
      }

      return {
        part: functionResponsePart(call.name, {
          ok: true,
          indices: parsed.indices,
        }),
        selected: parsed.indices,
      };
    }

    return {
      part: functionResponsePart(call.name, {
        error: `알 수 없는 도구: ${call.name}`,
      }),
      selected: null,
    };
  }

}

function functionResponsePart(name: string, response: object): Part {
  return {
    functionResponse: {
      name,
      response,
    },
  };
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
