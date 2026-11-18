export const TECH_THEME_ID = 'tech';

export type NewsTheme = {
  id: string;
  label: string;
  listings: string[];
};

export function googleNews(query: string) {
  const q = encodeURIComponent(query);

  return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
}

/** 다음 뉴스 검색 최신순. 구글 뉴스 RSS 링크는 원문 주소로 풀 수 없어서 키워드 검색은 여기로 한다. */
export function daumNewsSearch(query: string, page = 1) {
  const q = encodeURIComponent(query);
  const paging = page > 1 ? `&p=${page}` : '';

  return `https://search.daum.net/search?w=news&q=${q}&sort=recency${paging}`;
}

export const NEWS_THEMES: NewsTheme[] = [
  {
    id: 'politics',
    label: '정치',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=100',
      'https://news.daum.net/politics',
      googleNews('정치'),
    ],
  },
  {
    id: 'economy',
    label: '경제',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=101',
      'https://news.daum.net/economy',
      googleNews('경제'),
    ],
  },
  {
    id: 'society',
    label: '사회',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=102',
      'https://news.daum.net/society',
      googleNews('사회'),
    ],
  },
  {
    id: 'life',
    label: '생활/문화',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=103',
      'https://news.daum.net/culture',
      'https://news.daum.net/life',
      googleNews('생활 문화'),
    ],
  },
  {
    id: 'world',
    label: '세계',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=104',
      'https://news.daum.net/world',
      googleNews('국제'),
    ],
  },
  {
    id: TECH_THEME_ID,
    label: 'IT/과학',
    listings: [
      'https://news.naver.com/main/list.naver?mode=LSD&mid=sec&sid1=105',
      'https://news.daum.net/tech',
      googleNews('IT 과학'),
    ],
  },
  {
    id: 'entertain',
    label: '연예',
    listings: [
      'https://entertain.daum.net/',
      'https://search.naver.com/search.naver?where=news&query=%EC%97%B0%EC%98%88',
      googleNews('연예'),
    ],
  },
  {
    id: 'sports',
    label: '스포츠',
    listings: [
      'https://search.naver.com/search.naver?where=news&query=%EC%8A%A4%ED%8F%AC%EC%B8%A0',
      googleNews('스포츠'),
    ],
  },
];

const byId = new Map(NEWS_THEMES.map((theme) => [theme.id, theme]));

export function getNewsTheme(id: string) {
  return byId.get(id) ?? null;
}

/** 관심 키워드 검색으로 모은 글. 테마 카탈로그에는 없고 기사 출처 표시에만 쓴다. */
export const FOCUS_THEME_ID = 'focus';

export function newsThemeLabel(id: string) {
  if (id === FOCUS_THEME_ID) {
    return '관심 키워드';
  }

  return byId.get(id)?.label ?? id;
}

export function isNewsThemeId(id: string) {
  return byId.has(id);
}
