import { createDb } from '@bella/db';
import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = config.DATABASE_URL ? createDb(config.DATABASE_URL) : null;
  const app = await buildApp({ config, db });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'encerrando');
    await app.close();
    await db?.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error('falha ao iniciar a API:', err);
  process.exit(1);
});
