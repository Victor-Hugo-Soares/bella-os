import { expect } from 'vitest';

/**
 * drizzle-orm envolve todo erro de query em `DrizzleQueryError`, cujo `.message` de
 * topo é só "Failed query: ...params: ..." — a mensagem real do Postgres (a que prova
 * QUAL regra foi violada: RLS, unique, check, etc.) fica em `.cause`. Testes que
 * verificam a causa exata de uma falha precisam olhar `.cause`, não `.message`.
 */
export async function expectPgErrorMatching(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (err) {
    thrown = err;
  }
  expect(thrown, 'esperava que a promise rejeitasse, mas ela resolveu').toBeDefined();
  const cause = thrown instanceof Error ? (thrown.cause ?? thrown) : thrown;
  const message = cause instanceof Error ? cause.message : String(cause);
  expect(message, `mensagem do Postgres não bate com ${pattern}: ${message}`).toMatch(pattern);
}
