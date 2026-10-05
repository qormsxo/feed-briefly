import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
