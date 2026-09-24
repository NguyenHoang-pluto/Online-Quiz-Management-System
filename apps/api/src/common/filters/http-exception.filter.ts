import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Chuẩn hóa mọi lỗi về một dạng JSON duy nhất để frontend xử lý thống nhất. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Lỗi hệ thống, vui lòng thử lại';
    // Trường phụ do nơi ném lỗi đính kèm, ví dụ code và examId để frontend biết
    // phải điều hướng đi đâu. Không có thì phần này rỗng, dạng JSON giữ nguyên.
    let extra: Record<string, unknown> = {};
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : ((res as any).message ?? exception.message);
      if (typeof res === 'object' && res !== null) {
        const { message: _m, statusCode: _s, error: _e, ...rest } = res as Record<string, unknown>;
        extra = rest;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...extra,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
