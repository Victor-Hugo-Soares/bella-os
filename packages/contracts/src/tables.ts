import { z } from 'zod';

/** Schemas de entrada de mesas/sessão de mesa (M6, DOMAIN_MODEL.md §1.4). */

export const createAreaSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().default(0),
});
export type CreateAreaInput = z.infer<typeof createAreaSchema>;

export const updateAreaSchema = createAreaSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;

export const createTableSchema = z.object({
  areaId: z.uuid().optional(),
  label: z.string().min(1).max(50),
  seats: z.number().int().min(1).default(2),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = createTableSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
