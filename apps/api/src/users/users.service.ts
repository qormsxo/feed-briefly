import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../articles/article.entity';
import { DigestLog } from '../digest/digest-log.entity';
import { User } from './user.entity';

export type KakaoUserUpsert = {
  kakaoId: string;
  nickname: string | null;
  email: string | null;
  kakaoAccessToken: string;
  kakaoRefreshToken: string;
  kakaoTokenExpiresAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findById(id: string) {
    return this.users.findOneBy({ id });
  }

  findByKakaoId(kakaoId: string) {
    return this.users.findOneBy({ kakaoId });
  }

  findAll() {
    return this.users.find();
  }

  async upsertFromKakao(input: KakaoUserUpsert) {
    const existing = await this.findByKakaoId(input.kakaoId);

    if (existing) {
      existing.nickname = input.nickname;
      existing.email = input.email;
      existing.kakaoAccessToken = input.kakaoAccessToken;
      existing.kakaoRefreshToken = input.kakaoRefreshToken;
      existing.kakaoTokenExpiresAt = input.kakaoTokenExpiresAt;

      return this.users.save(existing);
    }

    return this.users.save(this.users.create(input));
  }

  saveKakaoTokens(
    user: User,
    tokens: {
      kakaoAccessToken: string;
      kakaoRefreshToken: string;
      kakaoTokenExpiresAt: Date | null;
    },
  ) {
    user.kakaoAccessToken = tokens.kakaoAccessToken;
    user.kakaoRefreshToken = tokens.kakaoRefreshToken;
    user.kakaoTokenExpiresAt = tokens.kakaoTokenExpiresAt;

    return this.users.save(user);
  }

  /** 기사·다이제스트 로그까지 지운 뒤 유저를 삭제한다. 테마·키워드·피드는 CASCADE. */
  async deleteAccount(userId: string) {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다');
    }

    await this.users.manager.transaction(async (manager) => {
      await manager.delete(Article, { userId });
      await manager.delete(DigestLog, { userId });
      await manager.delete(User, { id: userId });
    });
  }
}
