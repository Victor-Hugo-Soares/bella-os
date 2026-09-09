import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createDb, schema, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';

/**
 * Login de staff de ponta a ponta pela API real (não `auth.api.*` direto — assim
 * também prova a integração HTTP com o Fastify, que é o risco real do M2: não existe
 * plugin oficial do Better Auth para Fastify, ver ACTIVE_PLAN.md). Endpoints e corpo
 * confirmados lendo o código-fonte instalado (`sign-up.mjs`/`sign-in.mjs`), não
 * adivinhados.
 *
 * `app` conecta como `bella_app` (`TEST_APP_DATABASE_URL`) — é como a API roda de
 * verdade a partir deste milestone (ver index.ts). Rodar este teste com a conexão de
 * dono esconderia exatamente o tipo de problema que o M1 existe para prevenir: RLS não
 * se aplica ao dono, então um bug de isolamento no módulo de identidade não apareceria.
 */
const ownerUrl = process.env.TEST_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
const appUrl = process.env.TEST_APP_DATABASE_URL;
if (!ownerUrl || !appPassword || !appUrl) {
  throw new Error(
    'TEST_DATABASE_URL, APP_DB_PASSWORD e TEST_APP_DATABASE_URL precisam estar definidas (ver .env.example).',
  );
}

let ownerDb: DbHandle;
let appDb: DbHandle;
let app: FastifyInstance;

const email = `staff-${newId()}@example.com`;
const password = 'senha-forte-123456';

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 2 });
  appDb = createDb(appUrl, { max: 2 });

  app = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: ownerUrl,
      APP_DATABASE_URL: appUrl,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
    }),
    db: appDb,
    version: 'test',
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const cookies = raw.map((c) => c.split(';')[0]).filter((c): c is string => Boolean(c));
  if (cookies.length === 0) throw new Error('Nenhum Set-Cookie na resposta de login.');
  return cookies.join('; ');
}

describe('cadastro e login de staff (Better Auth via HTTP, como bella_app)', () => {
  it('signUp cria o usuário e já retorna uma sessão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Funcionário de Teste', email, password },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('signIn com senha certa devolve sessão utilizável em /v1/me', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password },
    });
    expect(signIn.statusCode, signIn.body).toBe(200);
    const cookie = extractSessionCookie(signIn.headers['set-cookie']);

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(me.statusCode, me.body).toBe(200);
    const body = me.json();
    expect(body.user.email).toBe(email);
  });

  it('signIn com senha errada é rejeitado (não cria sessão)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password: 'senha-completamente-errada' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('signIn de usuário inexistente é rejeitado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: `nao-existe-${newId()}@example.com`, password: 'qualquer-coisa-123' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('/v1/me sem sessão retorna 401 (UNAUTHENTICATED)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('signOut invalida a sessão; /v1/me deixa de funcionar com o mesmo cookie', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password },
    });
    const cookie = extractSessionCookie(signIn.headers['set-cookie']);

    const before = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(before.statusCode).toBe(200);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie },
    });
    expect(signOut.statusCode, signOut.body).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('o usuário criado é visível pelo dono do banco (inspeção independente)', async () => {
    const rows = await ownerDb.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    expect(rows).toHaveLength(1);
  });
});
