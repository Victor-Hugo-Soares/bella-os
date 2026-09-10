import { z } from 'zod';

export const serviceRequestKindSchema = z.enum(['call_waiter', 'request_bill', 'other']);

export const createServiceRequestSchema = z.object({
  kind: serviceRequestKindSchema,
  note: z.string().max(300).optional(),
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
