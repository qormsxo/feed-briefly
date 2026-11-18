import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { UpdateUserKeywordsDto } from './dto/update-user-keywords.dto';
import { normalizeKeyword } from './keyword-filter';
import { KeywordKind, UserKeyword } from './user-keyword.entity';

const MAX_FOCUS_LENGTH = 120;

@Injectable()
export class UserKeywordsService {
  constructor(
    @InjectRepository(UserKeyword)
    private readonly keywords: Repository<UserKeyword>,
    private readonly users: UsersService,
  ) {}

  async getForUser(userId: string) {
    const user = await this.users.findById(userId);
    const rows = await this.keywords.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const include = rows
      .filter((row) => row.kind === 'include')
      .map((row) => row.word);
    const exclude = rows
      .filter((row) => row.kind === 'exclude')
      .map((row) => row.word);

    const focus =
      user?.focusNote?.trim() ||
      (include.length > 0 ? include.join(', ') : '');

    return { focus, exclude };
  }

  listByUser(userId: string) {
    return this.getForUser(userId);
  }

  async replace(userId: string, dto: UpdateUserKeywordsDto) {
    const focus = normalizeFocus(dto.focus ?? '');
    const exclude = collectKeywords(dto.exclude);

    await this.users.setFocusNote(userId, focus);

    const current = await this.keywords.find({ where: { userId } });
    const wanted = new Set(exclude.map((word) => key('exclude', word)));

    const removing = current.filter((row) => {
      if (row.kind === 'include') {
        return true;
      }

      return !wanted.has(key(row.kind, row.word));
    });

    if (removing.length > 0) {
      await this.keywords.remove(removing);
    }

    const have = new Set(
      current
        .filter((row) => row.kind === 'exclude')
        .map((row) => key(row.kind, row.word)),
    );

    const adding = exclude
      .filter((word) => !have.has(key('exclude', word)))
      .map((word) => ({ kind: 'exclude' as const, word }));

    if (adding.length > 0) {
      await this.keywords.save(
        adding.map((item) =>
          this.keywords.create({ userId, kind: item.kind, word: item.word }),
        ),
      );
    }

    return this.getForUser(userId);
  }
}

function normalizeFocus(raw: string): string | null {
  const focus = raw.replace(/\s+/g, ' ').trim();

  if (!focus) {
    return null;
  }

  if (focus.length > MAX_FOCUS_LENGTH) {
    throw new BadRequestException(
      `관심 한 줄은 ${MAX_FOCUS_LENGTH}자 이하로 적어 주세요`,
    );
  }

  return focus;
}

function collectKeywords(words: string[]) {
  const collected: string[] = [];
  const seen = new Set<string>();

  for (const raw of words) {
    if (!raw.trim()) {
      continue;
    }

    const word = normalizeKeyword(raw);

    if (!word) {
      throw new BadRequestException('키워드는 2자 이상 40자 이하로 적어 주세요');
    }

    if (seen.has(word)) {
      continue;
    }

    seen.add(word);
    collected.push(word);
  }

  return collected;
}

function key(kind: KeywordKind, word: string) {
  return `${kind}\0${word}`;
}
