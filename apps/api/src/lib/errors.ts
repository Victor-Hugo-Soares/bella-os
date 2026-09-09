import type { ErrorCode } from '@bella/contracts';
import { HTTP_STATUS_BY_CODE } from '@bella/contracts';

/**
 * Erro de negócio/aplicação com código estável. Handlers lançam AppError; o error handler
 * global converte para o envelope { error: { code, message, details, request_id } }.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}
