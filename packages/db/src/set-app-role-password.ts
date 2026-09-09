import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/**
 * Define/atualiza a senha do papel `bella_app` (criado sem login pela migration 0001,
 * de propósito — nunca commitar segredo numa migration). Roda como o DONO do banco
 * (`DATABASE_URL`), que tem permissão de ALTER ROLE, e concede LOGIN + senha lida do
 * ambiente. Idempotente: pode rodar de novo a qualquer momento para trocar a senha.
 *
 * Uso local/CI: `pnpm --filter @bella/db app-role` (lê DATABASE_URL e APP_DB_PASSWORD).
 * Em produção isso é um passo de operação separado, documentado em docs/RUNBOOK_DEV.md —
 * nunca rodado a partir deste script com um valor commitado.
 */
export async function setAppRolePassword(
  ownerConnectionString: string,
  password: string,
): Promise<void> {
  if (password.length < 8) {
    throw new Error('APP_DB_PASSWORD precisa ter pelo menos 8 caracteres.');
  }
  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    // Parametrizado: a senha nunca é interpolada como string no SQL.
    await client.query('alter role bella_app with login password $1', [password]);
  } finally {
    await client.end();
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = entry !== '' && entry === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const ownerUrl = process.env.DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!ownerUrl || !password) {
    console.error('DATABASE_URL e APP_DB_PASSWORD precisam estar definidas (ver .env.example).');
    process.exit(1);
  }
  setAppRolePassword(ownerUrl, password)
    .then(() => {
      console.warn('senha de bella_app atualizada.');
    })
    .catch((err: unknown) => {
      console.error('falha ao atualizar a senha de bella_app:', err);
      process.exit(1);
    });
}
