import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/article.entity';
import { DigestLog } from '../digest/digest-log.entity';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Article, DigestLog])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
