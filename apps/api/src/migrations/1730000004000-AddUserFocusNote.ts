import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFocusNote1730000004000 implements MigrationInterface {
  name = 'AddUserFocusNote1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "focusNote" character varying(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "focusNote"
    `);
  }
}
