import { z } from 'zod';

/**
 * `POST /v1/orders` e `POST /public/:tenantSlug/orders` (M8). Cliente manda só
 * `productId`+`quantity`(+`notes`) — preço vem sempre do servidor (DOMAIN_MODEL.md §3:
 * "total do cliente diferente do servidor" nunca é fonte de verdade).
 */
export const createOrderItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(500).optional(),
});
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;

export const createOrderSchema = z.object({
  items: z.array(createOrderItemSchema).min(1).max(100),
  notes: z.string().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
