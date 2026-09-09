import { z } from 'zod';

const envSchema = z.object({
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
  // módulo (identity) passou a fazer queries reais.
  APP_DATABASE_URL: z.url().optional(),
  // M2 (Better Auth). Obrigatória para assinar sessões; sem valor em dev só por
  // conveniência local — nunca comitar um valor real (regra 9 do CLAUDE.md).
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  // URL pública onde a própria API responde (usada pelo Better Auth para montar
  // callbacks/cookies corretamente). Sem apps/web ainda, aponta para a própria API.
  BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
  // Origem do front (ainda não existe — M4); usada em CORS e trustedOrigins.
  WEB_ORIGIN: z.url().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`configuração inválida: ${issues}`);
  }
  return parsed.data;
}
