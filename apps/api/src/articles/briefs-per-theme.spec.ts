import { briefsPerTheme } from './article-ingest.service';
import { takeRoundRobin } from '../crawl/html-crawler.service';
import {
  orderByInterestScores,
  parseInterestScores,
  parseSummaries,
} from '../gemini/gemini.service';

describe('요약 개수 배분', () => {
  it('테마가 많으면 앞 테마에 나머지를 1개씩 더 준다', () => {
    expect(briefsPerTheme(8, 12)).toEqual([2, 2, 2, 2, 1, 1, 1, 1]);
  });

  it('테마가 하나면 상한을 그 테마가 쓴다', () => {
    expect(briefsPerTheme(1, 12)).toEqual([12]);
  });

  it('테마 3개면 테마당 4개로 줄어 전체가 12개다', () => {
    expect(briefsPerTheme(3, 12)).toEqual([4, 4, 4]);
  });

  it('묶음 요약은 입력 순서를 유지하고 빈 요약은 버린다', () => {
    const raw = [
      '{"items":[',
      '{"title":"가","summary":"한 줄","interest":9},',
      '{"title":"","summary":"","interest":1},',
      '{"title":"다","summary":"세 줄","interest":4}',
      ']}',
    ].join('');

    expect(parseSummaries(raw, ['원제1', '원제2', '원제3'])).toEqual([
      { title: '가', summary: '한 줄', interest: 9 },
      null,
      { title: '다', summary: '세 줄', interest: 4 },
    ]);
  });

  it('흥미 점수가 높은 글이 앞으로 온다', () => {
    const raw = '{"scores":[3,9,7]}';
    expect(parseInterestScores(raw, 3)).toEqual([3, 9, 7]);
    expect(orderByInterestScores([3, 9, 7])).toEqual([1, 2, 0]);
  });

  it('사이트 목록을 번갈아 고르고 상한에서 멈춘다', () => {
    expect(
      takeRoundRobin(
        [
          ['naver-1', 'naver-2'],
          ['daum-1', 'daum-2'],
          ['google-1', 'google-2'],
        ],
        2,
        4,
      ),
    ).toEqual(['naver-1', 'daum-1', 'google-1', 'naver-2']);
  });
});
