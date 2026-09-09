import { z } from 'zod';

/**
 * Schemas de entrada do catálogo (M5, DOMAIN_MODEL.md §1.3). Compartilhados entre
 * API (validação de corpo) e, futuramente, o front (formulários) — fonte única.
 */

export const stationKindSchema = z.enum(['kitchen', 'pizza', 'bar', 'other']);

export const createStationSchema = z.object({
  name: z.string().min(1).max(100),
  kind: stationKindSchema.default('kitchen'),
  sortOrder: z.number().int().default(0),
});
export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = createStationSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateStationInput = z.infer<typeof updateStationSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const productKindSchema = z.enum(['simple', 'pizza']);

export const createProductSchema = z.object({
  categoryId: z.uuid(),
  stationId: z.uuid(),
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  basePriceCents: z.number().int().min(0),
  kind: productKindSchema.default('simple'),
  prepTimeMinutes: z.number().int().min(0).optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const setProductAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});
export type SetProductAvailabilityInput = z.infer<typeof setProductAvailabilitySchema>;

export const pricingModeSchema = z.enum(['delta', 'absolute']);

export const createModifierGroupSchema = z.object({
  name: z.string().min(1).max(100),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  pricingMode: pricingModeSchema.default('delta'),
  sortOrder: z.number().int().default(0),
});
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;

export const updateModifierGroupSchema = createModifierGroupSchema.partial();
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

export const createModifierSchema = z.object({
  groupId: z.uuid(),
  name: z.string().min(1).max(100),
  priceCents: z.number().int().default(0),
  sortOrder: z.number().int().default(0),
});
export type CreateModifierInput = z.infer<typeof createModifierSchema>;

export const updateModifierSchema = createModifierSchema.partial().extend({
  isAvailable: z.boolean().optional(),
});
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;

export const linkProductModifierGroupSchema = z.object({
  groupId: z.uuid(),
  sortOrder: z.number().int().default(0),
});
export type LinkProductModifierGroupInput = z.infer<typeof linkProductModifierGroupSchema>;
