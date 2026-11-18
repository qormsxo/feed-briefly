import {
  FunctionDeclaration,
  FunctionDeclarationsTool,
  SchemaType,
} from '@google/generative-ai';
import { isNumber, isPlainRecord, isString } from '../common/parse';

export const SELECT_INTERESTING_MAX_STEPS = 5;

export const INSPECT_LEAD_CHARS = 600;

export const selectInterestingTool: FunctionDeclarationsTool = {
  functionDeclarations: [
    inspectCandidateDeclaration(),
    selectBriefsDeclaration(),
  ],
};

function inspectCandidateDeclaration(): FunctionDeclaration {
  return {
    name: 'inspect_candidate',
    description:
      '후보 기사 본문 앞부분을 더 길게 본다. 제목만으로 판단이 어려울 때 쓴다.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        index: {
          type: SchemaType.INTEGER,
          description: '후보 인덱스 (0부터)',
        },
      },
      required: ['index'],
    },
  };
}

function selectBriefsDeclaration(): FunctionDeclaration {
  return {
    name: 'select_briefs',
    description:
      '최종으로 고를 기사 인덱스를 흥미·화제성 높은 순으로 제출한다. 선택이 끝나면 반드시 이 도구를 호출한다.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        indices: {
          type: SchemaType.ARRAY,
          description: '고른 후보 인덱스 배열. 길이는 요청한 개수와 같아야 한다.',
          items: { type: SchemaType.INTEGER },
        },
      },
      required: ['indices'],
    },
  };
}

export type SelectInterestingCandidate = {
  title: string;
  lead: string;
};

export function buildSelectInterestingPrompt(
  items: SelectInterestingCandidate[],
  room: number,
  theme?: string,
  focus?: string,
) {
  const themeLine = theme ? `테마: ${theme}` : null;
  const focusLine = focus ? `관심: ${focus}` : null;

  const lines = items.map((item, index) => {
    const lead = item.lead.replace(/\s+/g, ' ').trim().slice(0, 160);

    return `${index}. ${item.title}\n${lead}`;
  });

  return [
    '너는 아침 뉴스 브리핑 에디터다.',
    themeLine,
    focusLine,
    `아래 후보 ${items.length}개 중 자극적이고 화제성 있는 글 ${room}개를 골라라.`,
    focusLine
      ? '관심이 있으면 그에 가까운 글을 우선하되, 화제성도 함께 본다.'
      : null,
    '필요하면 inspect_candidate로 본문을 더 확인한 뒤, select_briefs로 끝내라.',
    '거짓 과장 금지. 인덱스는 후보 목록에 있는 값만 쓴다.',
    'select_briefs의 indices 길이는 정확히 요청 개수와 같아야 하고, 중복 없이 흥미 높은 순이다.',
    '',
    lines.join('\n\n'),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function parseInspectIndex(
  args: unknown,
  candidateCount: number,
): { ok: true; index: number } | { ok: false; error: string } {
  if (!isPlainRecord(args) || !('index' in args)) {
    return { ok: false, error: 'index가 필요합니다' };
  }

  const raw = args.index;
  const index = isNumber(raw)
    ? raw
    : isString(raw)
      ? Number(raw)
      : Number.NaN;

  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) {
    return {
      ok: false,
      error: `index는 0..${candidateCount - 1} 정수여야 합니다`,
    };
  }

  return { ok: true, index };
}

export function parseSelectIndices(
  args: unknown,
  candidateCount: number,
  room: number,
): { ok: true; indices: number[] } | { ok: false; error: string } {
  if (!isPlainRecord(args) || !('indices' in args) || !Array.isArray(args.indices)) {
    return { ok: false, error: 'indices 배열이 필요합니다' };
  }

  if (args.indices.length !== room) {
    return {
      ok: false,
      error: `indices 길이는 ${room}이어야 합니다 (지금 ${args.indices.length})`,
    };
  }

  const indices: number[] = [];
  const seen = new Set<number>();

  for (const raw of args.indices) {
    const index = isNumber(raw)
      ? raw
      : isString(raw)
        ? Number(raw)
        : Number.NaN;

    if (!Number.isInteger(index) || index < 0 || index >= candidateCount) {
      return {
        ok: false,
        error: `잘못된 index=${String(raw)}. 0..${candidateCount - 1}만 허용`,
      };
    }

    if (seen.has(index)) {
      return { ok: false, error: `중복 index=${index}` };
    }

    seen.add(index);
    indices.push(index);
  }

  return { ok: true, indices };
}

export function inspectCandidatePayload(
  item: SelectInterestingCandidate,
  index: number,
) {
  const lead = item.lead.replace(/\s+/g, ' ').trim().slice(0, INSPECT_LEAD_CHARS);

  return {
    index,
    title: item.title,
    lead,
  };
}
