import { z } from 'zod';

/**
 * Códigos de erro estáveis da API (DOMAIN_MODEL.md §6). A UI decide a mensagem humana
 * a partir do código; `message` é apenas um fallback legível.
 * Adicionar códigos aqui é a única forma de criar um novo erro de negócio.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'TENANT_MISMATCH',
  'RATE_LIMITED',
  'IDEMPOTENCY_MISMATCH',
  'INVALID_TRANSITION',
  'ITEM_UNAVAILABLE',
  'TAB_CLOSED',
  'SESSION_CLOSED',
  'OVERPAYMENT',
  'CASH_SESSION_CLOSED',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
    request_id: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  TENANT_MISMATCH: 403,
  RATE_LIMITED: 429,
  IDEMPOTENCY_MISMATCH: 409,
  INVALID_TRANSITION: 409,
  ITEM_UNAVAILABLE: 422,
  TAB_CLOSED: 409,
  SESSION_CLOSED: 409,
  OVERPAYMENT: 409,
  CASH_SESSION_CLOSED: 409,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};
