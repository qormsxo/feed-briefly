import {
  buildExpandSearchQueriesPrompt,
  parseSearchQueries,
} from './expand-search-queries';

describe('expand-search-queries helpers', () => {
  it('builds a prompt with focus and theme seed', () => {
    const prompt = buildExpandSearchQueriesPrompt('반도체 수출', '경제');

    expect(prompt).toContain('관심: 반도체 수출');
    expect(prompt).toContain('테마 시드: 경제');
    expect(prompt).toContain('queries');
  });

  it('parses unique short queries', () => {
    expect(
      parseSearchQueries('{"queries":["반도체 수출","금리 인하","반도체 수출"]}'),
    ).toEqual(['반도체 수출', '금리 인하']);
  });

  it('returns null for invalid json', () => {
    expect(parseSearchQueries('not-json')).toBeNull();
  });
});
