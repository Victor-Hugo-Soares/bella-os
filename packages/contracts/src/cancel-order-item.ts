import { z } from 'zod';

/** `PATCH /v1/orders/:orderId/items/:itemId/cancel` (M11). */
export const cancelOrderItemSchema = z
  .object({
    stage: z.enum(['before_production', 'after_production']),
    reason: z.string().min(1).max(500),
    chargeOnCancel: z.boolean().optional(),
  })
  .refine((v) => v.stage !== 'after_production' || v.chargeOnCancel !== undefined, {
    message: 'chargeOnCancel é obrigatório para cancelamento depois da produção.',
    path: ['chargeOnCancel'],
  });
export type CancelOrderItemInput = z.infer<typeof cancelOrderItemSchema>;
