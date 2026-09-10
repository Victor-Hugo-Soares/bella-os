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
