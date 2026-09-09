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
    // Latência do `select 1`, em milissegundos (M3). Ausente quando o banco não está
    // configurado ou a checagem falhou antes de medir.
    database_latency_ms: z.number().nonnegative().optional(),
  }),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
