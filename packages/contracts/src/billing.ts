import { z } from 'zod';

/**
 * `POST /v1/tabs/:id/discounts` (M12). Desconto percentual (em bps, mesma unidade de
 * `tenant_settings.service_fee_bps`) ou fixo (em centavos) — nunca os dois campos ao
 * mesmo tempo, por isso é uma união discriminada em vez de campos opcionais soltos.
 */
export const applyDiscountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('percentage'),
    bps: z.number().int().min(1).max(10_000),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    kind: z.literal('fixed'),
    amountCents: z.number().int().min(1),
    reason: z.string().min(1).max(500),
  }),
]);
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;
