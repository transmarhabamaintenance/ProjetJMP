import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { formatDateTime } from './datetime';

/**
 * Réponses d'erreur JSON uniformes :
 * { timestamp, status, error, message }.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Erreur interne';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = reasonPhrase(status);
      const body = exception.getResponse() as any;
      const raw = typeof body === 'string' ? body : (body?.message ?? exception.message);
      message = Array.isArray(raw) ? raw.join('; ') : String(raw);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(`Erreur interne : ${message}`, exception instanceof Error ? exception.stack : undefined);
      message = `Erreur interne : ${message}`;
    }

    response.status(status).json({
      timestamp: formatDateTime(new Date()),
      status,
      error,
      message,
    });
  }
}

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Content Too Large',
  500: 'Internal Server Error',
};

function reasonPhrase(status: number): string {
  return REASONS[status] ?? 'Unknown Error';
}
