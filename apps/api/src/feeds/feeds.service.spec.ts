import { FeedsService } from './feeds.service';

describe('FeedsService', () => {
  const feeds = {
    find: jest.fn(),
  };

  const service = new FeedsService(feeds as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists feeds for a user', async () => {
    feeds.find.mockResolvedValue([{ id: 'f1' }]);
    await expect(service.listByUser('u1')).resolves.toEqual([{ id: 'f1' }]);
    expect(feeds.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { createdAt: 'DESC' },
    });
  });
});
