import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, QueryFailedError } from 'typeorm';
import { isError } from '../common/parse';
import { ParsedFeed, RssParserService } from '../rss/rss-parser.service';
import { CreateFeedDto } from './dto/create-feed.dto';
import { UpdateFeedDto } from './dto/update-feed.dto';
import { Feed } from './feed.entity';

type NewFeed = {
  userId: string;
  url: string;
  title: string | null;
};

type FeedStore = {
  create(value: NewFeed): NewFeed;
  save(feed: NewFeed): Promise<NewFeed>;
  find(options: FindManyOptions<Feed>): Promise<Feed[]>;
  findOneBy(where: { id: string; userId: string }): Promise<Feed | null>;
  remove(feed: Feed): Promise<Feed>;
};

type FeedReader = {
  assertValidFeed(url: string): Promise<ParsedFeed>;
};

@Injectable()
export class FeedsService {
  constructor(
    @InjectRepository(Feed)
    private readonly feeds: FeedStore,
    @Inject(RssParserService)
    private readonly rss: FeedReader,
  ) {}

  async create(userId: string, dto: CreateFeedDto) {
    const parsed = await this.rss.assertValidFeed(dto.url);

    const feed = this.feeds.create({
      userId,
      url: dto.url,
      title: parsed.title ?? null,
    });

    try {
      return await this.feeds.save(feed);
    } catch (error) {
      if (isError(error)) {
        this.rethrowDuplicate(error);
      }

      throw error;
    }
  }

  listByUser(userId: string) {
    return this.feeds.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  listAll() {
    return this.feeds.find({ order: { createdAt: 'ASC' } });
  }

  async update(userId: string, feedId: string, dto: UpdateFeedDto) {
    const feed = await this.findOwned(userId, feedId);

    if (dto.url && dto.url !== feed.url) {
      const parsed = await this.rss.assertValidFeed(dto.url);
      feed.url = dto.url;
      feed.title = parsed.title ?? feed.title;
    }

    try {
      return await this.feeds.save(feed);
    } catch (error) {
      if (isError(error)) {
        this.rethrowDuplicate(error);
      }

      throw error;
    }
  }

  async remove(userId: string, feedId: string) {
    const feed = await this.findOwned(userId, feedId);
    await this.feeds.remove(feed);
  }

  private async findOwned(userId: string, feedId: string) {
    const feed = await this.feeds.findOneBy({ id: feedId, userId });

    if (!feed) {
      throw new NotFoundException('피드를 찾을 수 없습니다');
    }

    return feed;
  }

  private rethrowDuplicate(error: Error) {
    if (error instanceof QueryFailedError && isUniqueViolation(error.driverError)) {
      throw new ConflictException('이미 등록된 피드입니다');
    }
  }
}

function isUniqueViolation(value: unknown): value is { code: '23505' } {
  return value instanceof Object && 'code' in value && value.code === '23505';
}
