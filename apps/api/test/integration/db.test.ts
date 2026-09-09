import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, currentTenantId, withTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { readyResponseSchema } from '@bella/contracts';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL não definida. Suba o banco (pnpm db:up) e exporte a variável (ver .env.example).',
  );
}

let handle: DbHandle;

beforeAll(async () => {
  await runMigrations(url);
  handle = createDb(url, { max: 2 });
});

afterAll(async () => {
  await handle.close();
});

describe('banco de dados (integração)', () => {
  it('conecta e responde select 1', async () => {
    const res = await handle.db.execute<{ one: number }>(sql`select 1 as one`);
    expect(res.rows[0]?.one).toBe(1);
  });

  it('migrator criou a tabela de controle drizzle', async () => {
    const res = await handle.db.execute<{ exists: boolean }>(
      sql`select exists (
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as exists`,
    );
    expect(res.rows[0]?.exists).toBe(true);
  });

  it('withTenant define app.tenant_id apenas dentro da transação', async () => {
    const tenantA = '11111111-1111-4111-8111-111111111111';
    const inside = await withTenant(handle.db, tenantA, (tx) => currentTenantId(tx));
    expect(inside).toBe(tenantA);
    // fora da transação, a conexão do pool não pode "vazar" o tenant
    expect(await currentTenantId(handle.db)).toBeNull();
  });

  it('withTenant rejeita tenantId que não é UUID', async () => {
    await expect(
      withTenant(handle.db, "x'; drop table tenants; --", async () => 1),
    ).rejects.toThrow(/UUID/);
  });

  it('duas transações concorrentes com tenants diferentes não se misturam', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const results = await Promise.all([
      withTenant(handle.db, a, async (tx) => {
        await tx.execute(sql`select pg_sleep(0.05)`);
        return currentTenantId(tx);
      }),
      withTenant(handle.db, b, async (tx) => currentTenantId(tx)),
    ]);
    expect(results).toEqual([a, b]);
  });
});

describe('GET /ready com banco real', () => {
  it('responde ready/ok', async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: url }),
      db: handle,
      version: 'test',
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const parsed = readyResponseSchema.parse(res.json());
    expect(parsed).toEqual({ status: 'ready', checks: { database: 'ok' } });
    await app.close();
  });
});
