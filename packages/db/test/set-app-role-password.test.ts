import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PgModule from 'pg';

/**
 * Regressão: `ALTER ROLE ... PASSWORD $1` falhou de verdade na CI com
 * "syntax error at or near $1" — o parser de DDL do Postgres não aceita parâmetro do
 * protocolo estendido nessa posição. Este teste garante que a query enviada é sempre um
 * literal SQL corretamente escapado (via pg.escapeLiteral), nunca um placeholder `$1`,
 * e nunca a senha "crua" interpolada sem escape.
 */

const queryCalls: string[] = [];

vi.mock('pg', async () => {
  const actual = await vi.importActual<typeof PgModule>('pg');
  class FakeClient {
    async connect() {}
    async query(text: string) {
      queryCalls.push(text);
    }
    async end() {}
  }
  return {
    default: { ...actual, Client: FakeClient },
    Client: FakeClient,
    escapeLiteral: actual.escapeLiteral,
  };
});

describe('setAppRolePassword', () => {
  beforeEach(() => {
    queryCalls.length = 0;
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('nunca usa placeholder $1 em ALTER ROLE (DDL não aceita parâmetro nessa posição)', async () => {
    const { setAppRolePassword } = await import('../src/set-app-role-password');
    await setAppRolePassword('postgres://owner@localhost/db', 'senha-de-teste-123');
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]).not.toMatch(/\$1/);
    expect(queryCalls[0]).toMatch(/^alter role bella_app with login password /);
  });

  it('escapa aspas simples na senha (nunca interpola cru)', async () => {
    const { setAppRolePassword } = await import('../src/set-app-role-password');
    await setAppRolePassword('postgres://owner@localhost/db', "senha'perigosa123");
    expect(queryCalls[0]).toContain("''"); // aspa simples duplicada = escape correto
    expect(queryCalls[0]).not.toContain("password 'senha'perigosa123'"); // não-escapado quebraria o SQL
  });

  it('rejeita senha curta antes de abrir conexão', async () => {
    const { setAppRolePassword } = await import('../src/set-app-role-password');
    await expect(setAppRolePassword('postgres://owner@localhost/db', '123')).rejects.toThrow(
      /pelo menos 8 caracteres/,
    );
    expect(queryCalls).toHaveLength(0);
  });
});
