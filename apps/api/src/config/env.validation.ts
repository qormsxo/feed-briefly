import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default((parent: { NODE_ENV?: string }) =>
      parent.NODE_ENV === 'production' ? 'warn' : 'debug',
    ),
  WEB_ORIGIN: Joi.string().uri().required(),
  DATABASE_URL: Joi.string().min(1).required(),
  DATABASE_SSL: Joi.string().valid('true', 'false').default('false'),
  KAKAO_REST_API_KEY: Joi.string().min(1).required(),
  KAKAO_CLIENT_SECRET: Joi.string().min(1).required(),
  KAKAO_REDIRECT_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  TOKEN_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  GEMINI_API_KEY: Joi.string().min(1).required(),
  GEMINI_MODEL: Joi.string().default('gemini-3.8-flash'),
  INTERNAL_SECRET: Joi.string().min(8).required(),
  KAKAO_FEED_IMAGE_URL: Joi.string().uri().optional().allow(''),
});

export function isProduction(nodeEnv?: string) {
  return nodeEnv === 'production';
}

export function parseOrigins(webOrigin: string): string[] {
  return webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
