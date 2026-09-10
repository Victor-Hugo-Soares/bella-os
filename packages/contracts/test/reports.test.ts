import { describe, expect, it } from 'vitest';
import { dailyReportQuerySchema } from '../src/reports';

describe('dailyReportQuerySchema', () => {
  it('aceita from < to', () => {
    const result = dailyReportQuerySchema.safeParse({
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-11T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita from >= to', () => {
    const result = dailyReportQuerySchema.safeParse({
      from: '2026-09-11T00:00:00.000Z',
      to: '2026-09-10T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita datas mal formatadas', () => {
    const result = dailyReportQuerySchema.safeParse({ from: '2026-09-10', to: 'amanhã' });
    expect(result.success).toBe(false);
  });
});
