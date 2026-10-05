import { BadRequestException } from '@nestjs/common';
import { UserThemesService } from './user-themes.service';

describe('UserThemesService', () => {
  const themes = {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const service = new UserThemesService(themes);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unknown theme ids', async () => {
    await expect(
      service.replace('u1', { themeIds: ['politics', '개발'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(themes.save).not.toHaveBeenCalled();
  });

  it('adds new themes and removes unchecked ones', async () => {
    themes.find.mockResolvedValueOnce([{ id: 'r1', userId: 'u1', theme: 'sports' }]);
    themes.find.mockResolvedValueOnce([
      { id: 'r2', userId: 'u1', theme: 'politics' },
    ]);
    themes.save.mockResolvedValue([]);
    await expect(
      service.replace('u1', { themeIds: ['politics', 'politics'] }),
    ).resolves.toMatchObject({
      selected: ['politics'],
    });
    expect(themes.remove).toHaveBeenCalledWith([
      expect.objectContaining({ theme: 'sports' }),
    ]);
    expect(themes.save).toHaveBeenCalledWith([
      { userId: 'u1', theme: 'politics' },
    ]);
  });
});
