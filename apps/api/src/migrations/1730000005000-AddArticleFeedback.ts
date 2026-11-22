import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticleFeedback1730000005000 implements MigrationInterface {
  name = 'AddArticleFeedback1730000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "article_feedback" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "articleId" uuid NOT NULL,
        "value" character varying(4) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_feedback_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_feedback_userId_articleId" UNIQUE ("userId", "articleId"),
        CONSTRAINT "CHK_article_feedback_value" CHECK ("value" IN ('up', 'down')),
        CONSTRAINT "FK_article_feedback_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_article_feedback_articleId" FOREIGN KEY ("articleId")
          REFERENCES "articles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_article_feedback_articleId"
      ON "article_feedback" ("articleId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_article_feedback_articleId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "article_feedback"`);
  }
}
