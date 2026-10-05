import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateUserThemesDto } from './dto/update-user-themes.dto';
import { isNewsThemeId, NEWS_THEMES } from './news-themes';
import { UserTheme } from './user-theme.entity';

type ThemeLookup = {
  where?: { userId: string };
  order?: { createdAt: 'ASC' };
};

type NewTheme = {
  userId: string;
  theme: string;
};

type ThemeStore = {
  find(options: ThemeLookup): Promise<UserTheme[]>;
  create(value: NewTheme): NewTheme;
  save(rows: NewTheme[]): Promise<NewTheme[]>;
  remove(rows: UserTheme[]): Promise<UserTheme[]>;
};

@Injectable()
export class UserThemesService {
  constructor(
    @InjectRepository(UserTheme)
    private readonly themes: ThemeStore,
  ) {}

  async getForUser(userId: string) {
    const rows = await this.themes.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return {
      catalog: NEWS_THEMES.map(({ id, label }) => ({ id, label })),
      selected: rows.map((row) => row.theme),
    };
  }

  listByUser(userId: string) {
    return this.themes.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  listAll() {
    return this.themes.find({ order: { createdAt: 'ASC' } });
  }

  async replace(userId: string, dto: UpdateUserThemesDto) {
    const unique = [...new Set(dto.themeIds.map((id) => id.trim()).filter(Boolean))];
    const unknown = unique.filter((id) => !isNewsThemeId(id));

    if (unknown.length > 0) {
      throw new BadRequestException(`알 수 없는 테마입니다: ${unknown.join(', ')}`);
    }

    const current = await this.themes.find({ where: { userId } });
    const wanted = new Set(unique);
    const removing = current.filter((row) => !wanted.has(row.theme));

    if (removing.length > 0) {
      await this.themes.remove(removing);
    }

    const have = new Set(current.map((row) => row.theme));
    const adding = unique.filter((id) => !have.has(id));

    if (adding.length > 0) {
      await this.themes.save(
        adding.map((theme) => this.themes.create({ userId, theme })),
      );
    }

    return this.getForUser(userId);
  }
}
