import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserKeywordsDto } from './dto/update-user-keywords.dto';
import { normalizeKeyword } from './keyword-filter';
import { KeywordKind, UserKeyword } from './user-keyword.entity';

@Injectable()
export class UserKeywordsService {
  constructor(
    @InjectRepository(UserKeyword)
    private readonly keywords: Repository<UserKeyword>,
  ) {}

  async getForUser(userId: string) {
    const rows = await this.keywords.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return {
      include: rows.filter((row) => row.kind === 'include').map((row) => row.word),
      exclude: rows.filter((row) => row.kind === 'exclude').map((row) => row.word),
    };
  }

  listByUser(userId: string) {
    return this.getForUser(userId);
  }

  async replace(userId: string, dto: UpdateUserKeywordsDto) {
    const include = collectKeywords(dto.include);
    const exclude = collectKeywords(dto.exclude);
    const overlap = include.filter((word) => exclude.includes(word));

    if (overlap.length > 0) {
      throw new BadRequestException(
        `같은 말은 포함과 제외에 함께 넣을 수 없습니다: ${overlap.join(', ')}`,
      );
    }

    const current = await this.keywords.find({ where: { userId } });

    const wanted = new Set([
      ...include.map((word) => key('include', word)),
      ...exclude.map((word) => key('exclude', word)),
    ]);

    const removing = current.filter((row) => !wanted.has(key(row.kind, row.word)));

    if (removing.length > 0) {
      await this.keywords.remove(removing);
    }

    const have = new Set(current.map((row) => key(row.kind, row.word)));

    const adding = [
      ...include
        .filter((word) => !have.has(key('include', word)))
        .map((word) => ({ kind: 'include' as const, word })),
      ...exclude
        .filter((word) => !have.has(key('exclude', word)))
        .map((word) => ({ kind: 'exclude' as const, word })),
    ];

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
