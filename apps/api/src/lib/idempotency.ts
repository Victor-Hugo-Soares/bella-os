import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { schema } from '@bella/db';
import type { Tx } from '@bella/db';
import { newId } from '@bella/domain';
import { AppError } from './errors';

const IDEMPOTENCY_TTL_HOURS = 24;

function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Idempotência real para mutações críticas (M8, `idempotency_keys` — tabela criada no
 * M1, nunca usada até agora). Precisa rodar DENTRO da mesma transação de `fn` para que
 * "reivindicar a chave" e "criar o pedido" sejam atômicos.
 *
 * Como funciona sob concorrência real (duas requisições simultâneas, mesma chave):
 * o `INSERT ... ON CONFLICT DO NOTHING` é a única operação que pode ser tentada com
 * segurança sabendo que vai colidir — ele NÃO aborta a transação em conflito (ao
 * contrário de um `INSERT` comum que viola um índice único, lição do M6/ADR-031).
 * Sob concorrência, o Postgres faz a segunda requisição ESPERAR a primeira transação
 * terminar (commit ou rollback) antes de decidir se houve conflito de verdade — nunca
 * duas requisições "ganham" a reivindicação ao mesmo tempo.
 * - Se `fn.returning()` devolve uma linha: esta requisição É a primeira a usar esta
 *   chave — roda `fn`, grava a resposta na mesma linha, tudo na mesma transação.
 * - Se devolve vazio: outra requisição (com a MESMA chave) já rodou (ou está prestes a
 *   ter rodado, já commitada por causa da espera acima) — busca a resposta gravada.
 *   Corpo diferente da primeira vez → `IDEMPOTENCY_MISMATCH` (409); corpo igual →
 *   devolve a resposta gravada, sem rodar `fn` de novo.
 */
export async function withIdempotency<T>(
  tx: Tx,
  tenantId: string,
  scope: string,
  key: string,
  requestBody: unknown,
  fn: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  const requestHash = hashRequest(requestBody);
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);

  const claimed = await tx
    .insert(schema.idempotencyKeys)
    .values({ id: newId(), tenantId, scope, key, requestHash, expiresAt })
    .onConflictDoNothing({
      target: [
        schema.idempotencyKeys.tenantId,
        schema.idempotencyKeys.scope,
        schema.idempotencyKeys.key,
      ],
    })
    .returning({ id: schema.idempotencyKeys.id });

  if (claimed.length > 0) {
    const result = await fn();
    await tx
      .update(schema.idempotencyKeys)
      .set({ responseStatus: result.status, responseBody: result.body as object })
      .where(eq(schema.idempotencyKeys.id, claimed[0]!.id));
    return result;
  }

  const [existing] = await tx
    .select()
    .from(schema.idempotencyKeys)
    .where(
      and(
        eq(schema.idempotencyKeys.tenantId, tenantId),
        eq(schema.idempotencyKeys.scope, scope),
        eq(schema.idempotencyKeys.key, key),
      ),
    );
  if (!existing) {
    // Não deveria acontecer (a linha existe, senão o insert acima teria "ganho"), mas
    // se acontecer é melhor um 409 explícito do que um erro genérico.
    throw new AppError('CONFLICT', 'Falha ao resolver idempotência; tente novamente.');
  }
  if (existing.requestHash !== requestHash) {
    throw new AppError(
      'IDEMPOTENCY_MISMATCH',
      'Esta Idempotency-Key já foi usada com um corpo diferente.',
    );
  }
  if (existing.responseStatus == null) {
    // A outra requisição ainda está processando (raro; sem espera de fato acontecida
    // — só é possível se `fn` da outra requisição ainda não terminou no momento exato
    // em que esta leu a linha já commitada mas antes do UPDATE final). Cliente deve
    // tentar de novo com a mesma chave; não é um erro definitivo.
    throw new AppError('CONFLICT', 'Requisição com esta chave ainda está em andamento.');
  }
  return { status: existing.responseStatus, body: existing.responseBody as T };
}
