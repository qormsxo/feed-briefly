import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  const articles = {
    findAndCount: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  const service = new ArticlesService(articles);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('paginates and reports hasMore', async () => {
    articles.findAndCount.mockResolvedValue([
      [
        { id: 'a1', feed: { title: 'HN', url: 'https://hnrss.org/frontpage' } },
        {
          id: 'a2',
          feed: null,
          theme: 'politics',
          crawlSource: null,
        },
      ],
      5,
    ]);
    await expect(service.paginateByUser('u1', 1, 2)).resolves.toMatchObject({
      items: [
        { id: 'a1', feedTitle: 'HN', theme: null },
        { id: 'a2', feedTitle: '네이버·다음·구글 · 정치', theme: '정치' },
      ],
      page: 1,
      limit: 2,
      total: 5,
      hasMore: true,
    });
    expect(articles.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 2 }),
    );
  });

  it('sets hasMore false on the last page', async () => {
    articles.findAndCount.mockResolvedValue([[{ id: 'a3' }], 3]);
    await expect(service.paginateByUser('u1', 2, 2)).resolves.toMatchObject({
      hasMore: false,
      page: 2,
    });
  });
});
