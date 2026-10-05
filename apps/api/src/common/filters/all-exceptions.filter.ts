import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { isNumber, isPlainRecord, isString } from '../parse';
import { isProduction } from '../../config/env.validation';

type HttpErrorBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  stack?: string;
};

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (!isString(item)) {
      return false;
    }
  }

  return true;
}

function isHttpErrorBody(value: unknown): value is HttpErrorBody {
  if (!isPlainRecord(value) || Array.isArray(value)) {
    return false;
  }

  if (
    'message' in value &&
    value.message !== undefined &&
    !isString(value.message) &&
    !isStringArray(value.message)
  ) {
    return false;
  }

  if ('error' in value && value.error !== undefined && !isString(value.error)) {
    return false;
  }

  if (
    'statusCode' in value &&
    value.statusCode !== undefined &&
    !isNumber(value.statusCode)
  ) {
    return false;
  }

  if ('stack' in value && value.stack !== undefined && !isString(value.stack)) {
    return false;
  }

  return true;
}

function clientErrorBody(status: number, body: HttpErrorBody) {
  const payload: HttpErrorBody = {
    statusCode: isNumber(body.statusCode) ? body.statusCode : status,
  };

  if (body.message !== undefined) {
    payload.message = body.message;
  }

  if (body.error !== undefined) {
    payload.error = body.error;
  }

  return payload;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const production = isProduction(process.env.NODE_ENV);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`${request.method} ${request.url} status=${status}`);

      if (production && status >= 500) {
        response.status(status).json({
          statusCode: status,
          message: '서버 오류',
        });

        return;
      }

      const payload = exception.getResponse();

      if (isString(payload)) {
        response.status(status).json({ statusCode: status, message: payload });

        return;
      }

      if (!isHttpErrorBody(payload)) {
        response.status(status).json({ statusCode: status, message: '서버 오류' });

        return;
      }

      response.status(status).json(clientErrorBody(status, payload));

      return;
    }

    this.logger.error(
      `${request.method} ${request.url} 처리 중 오류`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '서버 오류',
    });
  }

}
