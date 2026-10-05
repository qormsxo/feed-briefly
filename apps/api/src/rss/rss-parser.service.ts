import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { withRetry } from '../common/retry';

export type ParsedFeed = {
  title?: string;
  items: Array<{
    title?: string;
    link?: string;
    content?: string;
    contentSnippet?: string;
    isoDate?: string;
    pubDate?: string;
  }>;
};

@Injectable()
export class RssParserService {
  private readonly logger = new Logger(RssParserService.name);
  private readonly parser = new Parser({ timeout: 10_000 });

  async parse(url: string): Promise<ParsedFeed> {
    return withRetry(
      `RSS 파싱 url=${url}`,
      () => this.parser.parseURL(url),
      { logger: this.logger },
    );
  }

  async assertValidFeed(url: string): Promise<ParsedFeed> {
    try {
      const feed = await this.parse(url);

      if (!Array.isArray(feed.items)) {
        throw new BadRequestException('유효한 RSS 피드가 아닙니다');
      }

      return feed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(`RSS 파싱 실패 url=${url}`);
      throw new BadRequestException('RSS 피드를 파싱하지 못했습니다');
    }
  }
}
