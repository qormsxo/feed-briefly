import { buildSummarizePrompt, summaryLineCount } from './summarize-prompt';

describe('buildSummarizePrompt', () => {
  it('puts per-item line limits and the focus keyword on each block', () => {
    const prompt = buildSummarizePrompt([
      { title: 'A', source: '본문 A', budget: 90, focus: '  반도체   수출 ' },
      { title: 'B', source: '본문 B' },
    ]);

    expect(prompt).toContain(
      '1. 원제: A\n(요약 2줄, 줄마다 40자 이내 / 관심 키워드: 반도체 수출)\n본문 A',
    );
    expect(prompt).toContain('2. 원제: B\n(요약 3줄, 줄마다 40자 이내)\n본문 B');
    expect(prompt).toContain('→ ');
  });

  it('clips long sources', () => {
    const prompt = buildSummarizePrompt([{ title: 'A', source: '가'.repeat(10_000) }]);

    expect(prompt.length).toBeLessThan(5_000);
  });

  it('asks for fewer lines when the kakao budget is tight', () => {
    expect(summaryLineCount(160)).toBe(3);
    expect(summaryLineCount(127)).toBe(3);
    expect(summaryLineCount(100)).toBe(2);
    expect(summaryLineCount(40)).toBe(2);
  });
});
