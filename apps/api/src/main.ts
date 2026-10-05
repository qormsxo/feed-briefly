import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { SESSION_COOKIE } from './auth/auth.constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppLogger } from './config/app-logger';
import { parseOrigins } from './config/env.validation';
import { nestLogLevels } from './config/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(
    new AppLogger(
      nestLogLevels(config.get('LOG_LEVEL')),
      join(process.cwd(), 'logs', 'app.log'),
    ),
  );
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableCors({
    origin: parseOrigins(config.getOrThrow<string>('WEB_ORIGIN')),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('feed-briefly API')
    .setDescription(
      [
        '개인용 RSS 요약 브리핑 API.',
        '',
        '로그인: 브라우저에서 `/api/auth/kakao`로 카카오 로그인한 뒤,',
        '같은 브라우저에서 이 문서를 열면 `briefly_session` 쿠키가 붙는다.',
        '크론 발송은 Authorize에 `x-internal-secret`을 넣는다.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE,
    })
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'x-internal-secret' },
      'internal-secret',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const swaggerUi = {
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  };

  SwaggerModule.setup('docs', app, document, swaggerUi);
  SwaggerModule.setup('docs', app, document, {
    ...swaggerUi,
    useGlobalPrefix: true,
  });

  const port = Number(config.get('PORT') ?? 3000);
  app.enableShutdownHooks();
  await app.listen(port);
  startKeepAlive(config);
}

const KEEP_ALIVE_MS = 14 * 60 * 1000;

function startKeepAlive(config: ConfigService) {
  if (config.get('NODE_ENV') !== 'production') {
    return;
  }

  const redirect = config.get<string>('KAKAO_REDIRECT_URI');

  if (!redirect) {
    return;
  }

  let origin: string;

  try {
    origin = new URL(redirect).origin;
  } catch {
    return;
  }

  if (!origin.startsWith('https://')) {
    return;
  }

  const logger = new Logger('KeepAlive');

  const timer = setInterval(() => {
    void fetch(`${origin}/health`).then(
      (response) => {
        if (!response.ok) {
          logger.warn(`keep-alive status=${response.status}`);
        }
      },
      (error) => {
        const reason = error instanceof Error ? error.message : String(error);
        logger.warn(`keep-alive 실패 reason=${reason}`);
      },
    );
  }, KEEP_ALIVE_MS);

  timer.unref?.();
}

function registerProcessHandlers() {
  const logger = new Logger('Process');
  process.on('unhandledRejection', (reason) => {
    logger.error(
      'unhandledRejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException', error.stack);
    process.exit(1);
  });
}

registerProcessHandlers();

void bootstrap();
