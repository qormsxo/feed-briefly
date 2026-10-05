import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  response.status.mockReturnValue(response);

  // SAFETY: the spec only reads the HTTP request and response.
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/feeds' }),
    }),
  } as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const previous = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it('hides unknown errors from the client', () => {
    const json = jest.fn();
    const response = { status: jest.fn(), json };
    new AllExceptionsFilter().catch(new Error('secret'), createHost(response));
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: '서버 오류',
    });
  });

  it('strips stack traces from http errors in production', () => {
    process.env.NODE_ENV = 'production';
    const json = jest.fn();
    const response = { status: jest.fn(), json };
    new AllExceptionsFilter().catch(
      new HttpException({ message: 'boom', stack: 'TRACE' }, 503),
      createHost(response),
    );
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      message: '서버 오류',
    });
  });
});
