import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('bella-api'),
  version: z.string(),
  uptime_seconds: z.number().nonnegative(),
  server_time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    database: z.enum(['ok', 'error', 'not_configured']),
  }),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
