import {
  buildKakaoText,
  KAKAO_TEXT_MAX,
  KAKAO_TITLE_MAX,
  sortByInterest,
  summaryCharBudget,
} from './kakao-text';

describe('kakao-text', () => {
  it('orders highest interest first', () => {
    const picked = sortByInterest([
      { interest: 4, collectedAt: new Date('2026-09-20T10:00:00Z') },
      { interest: 9, collectedAt: new Date('2026-09-20T09:00:00Z') },
      { interest: 9, collectedAt: new Date('2026-09-20T11:00:00Z') },
      { interest: 2, collectedAt: new Date('2026-09-20T12:00:00Z') },
    ]);

    expect(picked.map((item) => item.interest)).toEqual([9, 9, 4, 2]);
    expect(picked[0].collectedAt.toISOString()).toBe('2026-09-20T11:00:00.000Z');
  });

  it('appends the original url and stays within kakao text limit', () => {
    const url = 'https://example.com/article';
    const text = buildKakaoText('제목', '한 줄\n두 줄\n세 줄', url);
    expect(text).toBe(`제목\n\n한 줄\n두 줄\n세 줄\n\n${url}`);
    expect(text.length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
    expect(text.endsWith(url)).toBe(true);

    const long = buildKakaoText('제목', '가'.repeat(400), url);
    expect(long.length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
    expect(long.startsWith('제목\n\n')).toBe(true);
    expect(long.endsWith(url)).toBe(true);
  });

  it('sizes the summary budget so title, summary and link fit without cutting', () => {
    const url = 'https://n.news.naver.com/mnews/article/001/0012345678';
    const budget = summaryCharBudget(url);
    const text = buildKakaoText('가'.repeat(KAKAO_TITLE_MAX), '나'.repeat(budget), url);

    expect(text.length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
    expect(text).not.toContain('…');
  });

  it('clamps the summary budget for very long or missing links', () => {
    expect(summaryCharBudget('https://example.com/' + 'a'.repeat(300))).toBe(40);
    expect(summaryCharBudget('')).toBe(160);
  });

  it('drops trailing lines instead of cutting mid-sentence', () => {
    const url = 'https://v.daum.net/v/20261117220942145';
    const lines = ['가'.repeat(50), '나'.repeat(50), '→ ' + '다'.repeat(50)];
    const text = buildKakaoText('제'.repeat(30), lines.join('\n'), url);

    expect(text.length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
    expect(text).toBe(`${'제'.repeat(30)}\n\n${lines[0]}\n${lines[1]}\n\n${url}`);
  });
});
