import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // DATABASE_URL é o DONO do banco — só para migrations/seed/operação (packages/db).
  // A API NUNCA deveria servir tráfego real com ela: o dono ignora RLS por padrão
  // (ADR-004), o que anularia o isolamento entre tenants provado no M1. Mantida aqui
  // só como fallback de desenvolvimento antes de rodar `pnpm db:app-role` — ver
  // APP_DATABASE_URL abaixo, que é o que `index.ts` realmente usa a partir do M2.
  DATABASE_URL: z.url().optional(),
  // Conexão como `bella_app` (sem BYPASSRLS, não é dono — M1 ADR-020): é isto que a
  // API usa para servir requisições de verdade a partir do M2, quando o primeiro
  // módulo (identity) passou a fazer queries reais. Opcional só no schema base porque
  // em dev cai-se para DATABASE_URL (ver aviso em index.ts) — o `.superRefine` abaixo
  // torna isto obrigatório de fato quando NODE_ENV=production.
  APP_DATABASE_URL: z.url().optional(),
  // M2 (Better Auth). Obrigatória para assinar sessões; sem valor em dev só por
  // conveniência local — nunca comitar um valor real (regra 9 do CLAUDE.md). Opcional
  // só no schema base pelo mesmo motivo do campo acima: o `.superRefine` exige em produção.
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  // URL pública onde a própria API responde (usada pelo Better Auth para montar
  // callbacks/cookies corretamente). Sem apps/web ainda, aponta para a própria API.
  BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
  // Origem do front; usada em CORS e trustedOrigins. Sem valor, CORS bloqueia toda
  // origem (fail-closed) — mas isso quebraria o cliente/admin em produção, daí exigida
  // pelo `.superRefine` abaixo quando NODE_ENV=production.
  WEB_ORIGIN: z.url().optional(),
});

// Campos que, no schema base, são opcionais só para permitir o fallback de
// conveniência de desenvolvimento (ver comentários acima e o aviso em index.ts).
// Subir com NODE_ENV=production sem eles é um erro de configuração real, não uma
// situação "vazia aceitável" — falha explícita aqui é melhor que RLS ignorada
// silenciosamente ou sessão assinada com segredo ausente.
const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'production') return;
  const required: Array<keyof typeof data> = [
    'APP_DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'WEB_ORIGIN',
  ];
  for (const key of required) {
    if (!data[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} é obrigatória quando NODE_ENV=production.`,
      });
    }
  }
});

export type AppConfig = z.infer<typeof baseEnvSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`configuração inválida: ${issues}`);
  }
  return parsed.data;
}
