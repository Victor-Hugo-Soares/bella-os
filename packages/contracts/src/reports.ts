import { z } from 'zod';

/**
 * `GET /v1/reports/daily?from=...&to=...` (M16). `from`/`to` são timestamps ISO
 * explícitos — sem cálculo automático de "dia operacional" (fuso + `business_day_cutoff`
 * exigiriam matemática de timezone sem biblioteca testada no projeto; fica para quando
 * existir uma tela real de relatório, `ACTIVE_PLAN.md` Gate de Plano do M16 #2).
 */
export const dailyReportQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine((v) => new Date(v.from).getTime() < new Date(v.to).getTime(), {
    message: '"from" deve ser anterior a "to".',
    path: ['to'],
  });
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;
