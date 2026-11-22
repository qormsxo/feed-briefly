import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Article } from './article.entity';

export const FEEDBACK_VALUES = ['up', 'down'] as const;

export type FeedbackValue = (typeof FEEDBACK_VALUES)[number];

/** 요약 기사에 대한 사용자의 추천(up)/비추천(down). 사용자·기사당 하나. */
@Entity('article_feedback')
@Index(['userId', 'articleId'], { unique: true })
@Check('CHK_article_feedback_value', `"value" IN ('up', 'down')`)
export class ArticleFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  article: Article;

  @Column({ type: 'uuid' })
  articleId: string;

  @Column({ type: 'varchar', length: 4 })
  value: FeedbackValue;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
