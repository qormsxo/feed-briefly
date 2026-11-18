import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { Feed } from './feed.entity';

@Injectable()
export class FeedsService {
  constructor(
    @InjectRepository(Feed)
    private readonly feeds: Repository<Feed>,
  ) {}

  listByUser(userId: string) {
    return this.feeds.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    } satisfies FindManyOptions<Feed>);
  }

  listAll() {
    return this.feeds.find({ order: { createdAt: 'ASC' } });
  }
}
