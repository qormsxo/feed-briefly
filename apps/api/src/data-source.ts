import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { typeormCliOptions } from './config/typeorm.config';

loadEnv({ path: join(__dirname, '..', '.env') });

loadEnv({ path: join(__dirname, '..', '..', '..', '.env') });

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is required to run TypeORM CLI');
}

export default new DataSource(
  typeormCliOptions({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: url,
    DATABASE_SSL: process.env.DATABASE_SSL,
  }),
);
