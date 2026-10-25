import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { isProduction } from './env.validation';

type DbEnv = {
  NODE_ENV?: string;
  DATABASE_URL: string;
  DATABASE_SSL?: string;
};

export function postgresSsl(databaseSsl?: string) {
  return databaseSsl === 'true' ? { rejectUnauthorized: false } : false;
}

/** Aiven 등 관리형 URL의 sslmode=require가 pg에서 verify-full로 잡히지 않게 맞춤. */
export function databaseUrl(url: string, databaseSsl?: string) {
  if (databaseSsl !== 'true') {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.delete('channel_binding');
  parsed.searchParams.set('sslmode', 'require');
  parsed.searchParams.set('uselibpqcompat', 'true');

  return parsed.toString();
}

export function typeormNestOptions(env: DbEnv): TypeOrmModuleOptions {
  const production = isProduction(env.NODE_ENV);

  return {
    type: 'postgres',
    url: databaseUrl(env.DATABASE_URL, env.DATABASE_SSL),
    ssl: postgresSsl(env.DATABASE_SSL),
    autoLoadEntities: true,
    synchronize: !production,
    logging: env.NODE_ENV === 'development',
    migrations: ['dist/migrations/*.js'],
    migrationsRun: false,
  };
}

export function typeormCliOptions(env: DbEnv): DataSourceOptions {
  const compiled = __filename.endsWith('.js');

  return {
    type: 'postgres',
    url: databaseUrl(env.DATABASE_URL, env.DATABASE_SSL),
    ssl: postgresSsl(env.DATABASE_SSL),
    entities: compiled ? ['dist/**/*.entity.js'] : ['src/**/*.entity.ts'],
    migrations: compiled
      ? ['dist/migrations/*.js']
      : ['src/migrations/*.ts'],
    synchronize: false,
    logging: env.NODE_ENV === 'development',
  };
}
