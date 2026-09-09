import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './client';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDb(connectionString, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = entry !== '' && entry === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL não definida. Copie .env.example para .env (ver docs/RUNBOOK_DEV.md).',
    );
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.warn(`migrations aplicadas a partir de ${migrationsFolder}`);
    })
    .catch((err) => {
      console.error('falha ao migrar:', err);
      process.exit(1);
    });
}
