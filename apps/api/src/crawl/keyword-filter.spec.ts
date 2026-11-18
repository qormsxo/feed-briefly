import {
  filterByKeywords,
  focusKeywords,
  normalizeKeyword,
} from './keyword-filter';

describe('키워드 거름', () => {
  const pages = [
    { title: '기준금리 동결', text: '한국은행이 금리를 유지했다.' },
    { title: '반도체 수출', text: '메모리 수요가 늘었다.' },
    { title: '연예인 운세', text: '이번 주 운세입니다.' },
  ];

  it('공백을 접고 소문자로 맞춘다', () => {
    expect(normalizeKeyword('  AI 칩  ')).toBe('ai 칩');
    expect(normalizeKeyword('금')).toBeNull();
  });

  it('포함 말이 없으면 제외만 적용한다', () => {
    expect(filterByKeywords(pages, [], ['운세']).map((page) => page.title)).toEqual([
      '기준금리 동결',
      '반도체 수출',
    ]);
  });

  it('포함 말 중 하나라도 있으면 남긴다', () => {
    expect(
      filterByKeywords(pages, ['금리', '반도체'], ['운세']).map((page) => page.title),
    ).toEqual(['기준금리 동결', '반도체 수출']);
  });

  it('제외가 포함보다 먼저다', () => {
    expect(filterByKeywords(pages, ['운세'], ['운세'])).toEqual([]);
  });
});

describe('관심 키워드', () => {
  it('splits by comma, normalizes, dedupes and caps at five', () => {
    expect(focusKeywords(' 카리나 , 엔비디아,카리나, a ,')).toEqual(['카리나', '엔비디아']);
    expect(focusKeywords('a1,b2,c3,d4,e5,f6')).toHaveLength(5);
    expect(focusKeywords('')).toEqual([]);
  });
});
