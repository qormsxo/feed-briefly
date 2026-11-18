import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  kakaoId: string;

  @Column({ type: 'varchar', nullable: true })
  nickname: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'text' })
  kakaoAccessToken: string;

  @Column({ type: 'text' })
  kakaoRefreshToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  kakaoTokenExpiresAt: Date | null;

  /** 관심 한 줄. 검색 쿼리 시드로 쓴다. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  focusNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
