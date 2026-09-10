import { z } from 'zod';

/** `POST /v1/cash-sessions/open` (M13). */
export const openCashSessionSchema = z.object({
  openingFloatCents: z.number().int().min(0),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const paymentMethodSchema = z.enum(['cash', 'debit', 'credit', 'pix', 'voucher', 'other']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * `POST /v1/tabs/:id/payments` (M13). Troco só existe em dinheiro: `tenderedCents` é
 * proibido em qualquer outro método (cartão/PIX não têm "valor entregue" diferente do
 * cobrado) e obrigatório (>= `amountCents`) quando `method === 'cash'`.
 */
export const createPaymentSchema = z
  .object({
    method: paymentMethodSchema,
    amountCents: z.number().int().min(1),
    tenderedCents: z.number().int().min(1).optional(),
  })
  .refine((v) => v.method === 'cash' || v.tenderedCents === undefined, {
    message: 'tenderedCents só é aceito quando method="cash".',
    path: ['tenderedCents'],
  })
  .refine((v) => v.method !== 'cash' || v.tenderedCents !== undefined, {
    message: 'Pagamento em dinheiro exige tenderedCents.',
    path: ['tenderedCents'],
  })
  .refine((v) => v.method !== 'cash' || (v.tenderedCents ?? 0) >= v.amountCents, {
    message: 'tenderedCents não pode ser menor que amountCents.',
    path: ['tenderedCents'],
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** `POST /v1/payments/:id/void` (M13). */
export const voidPaymentSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

/**
 * `POST /v1/cash-sessions/:id/movements` (M14) — sangria ou suprimento. `adjustment`
 * está reservado no `CHECK` do banco mas não tem caso de uso real ainda, então não
 * entra aqui (YAGNI, `ACTIVE_PLAN.md` Gate de Plano do M14 #1).
 */
export const cashMovementSchema = z.object({
  type: z.enum(['withdrawal', 'deposit']),
  method: paymentMethodSchema,
  amountCents: z.number().int().min(1),
  reason: z.string().min(1).max(500),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

/**
 * `POST /v1/cash-sessions/:id/close` (M14) — contado por forma de pagamento. Forma sem
 * entrada aqui é tratada como contado 0 pelo serviço (vira divergência visível se havia
 * algo esperado naquela forma, nunca um valor escondido).
 */
export const closeCashSessionSchema = z.object({
  counted: z
    .array(
      z.object({
        method: paymentMethodSchema,
        amountCents: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
