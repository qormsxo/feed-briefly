import { NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  const articles = {
    findAndCount: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const feedback = {
    find: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  };

  const service = new ArticlesService(articles, feedback);

  beforeEach(() => {
    jest.clearAllMocks();
    feedback.find.mockResolvedValue([]);
  });

  it('paginates and reports hasMore', async () => {
    articles.findAndCount.mockResolvedValue([
      [
        { id: 'a1', feed: { title: 'HN', url: 'https://hnrss.org/frontpage' } },
        {
          id: 'a2',
          feed: null,
          theme: 'politics',
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

  it('includes the current user feedback in one query', async () => {
    articles.findAndCount.mockResolvedValue([
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
      3,
    ]);
    feedback.find.mockResolvedValue([
      { articleId: 'a1', value: 'up' },
      { articleId: 'a3', value: 'down' },
    ]);

    const result = await service.paginateByUser('u1', 1, 10);

    expect(result.items.map((item) => item.feedback)).toEqual([
      'up',
      null,
      'down',
    ]);
    expect(feedback.find).toHaveBeenCalledTimes(1);
    expect(feedback.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
      }),
    );
  });

  it('skips the feedback query for an empty page', async () => {
    articles.findAndCount.mockResolvedValue([[], 0]);
    await service.paginateByUser('u1', 1, 10);
    expect(feedback.find).not.toHaveBeenCalled();
  });

  it('upserts feedback on an own article', async () => {
    articles.findOne.mockResolvedValue({ id: 'a1' });
    await expect(service.setFeedback('u1', 'a1', 'down')).resolves.toEqual({
      articleId: 'a1',
      feedback: 'down',
    });
    expect(articles.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', userId: 'u1' } }),
    );
    expect(feedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', articleId: 'a1', value: 'down' }),
      { conflictPaths: ['userId', 'articleId'] },
    );
  });

  it('clears feedback on an own article', async () => {
    articles.findOne.mockResolvedValue({ id: 'a1' });
    await expect(service.clearFeedback('u1', 'a1')).resolves.toEqual({
      articleId: 'a1',
      feedback: null,
    });
    expect(feedback.delete).toHaveBeenCalledWith({
      userId: 'u1',
      articleId: 'a1',
    });
  });

  it('returns 404 for an article of another user', async () => {
    articles.findOne.mockResolvedValue(null);
    await expect(
      service.setFeedback('u1', 'other', 'up'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.clearFeedback('u1', 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(feedback.upsert).not.toHaveBeenCalled();
    expect(feedback.delete).not.toHaveBeenCalled();
  });
});
