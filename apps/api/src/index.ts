import { createDb } from '@bella/db';
import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();

  // A API deve servir tráfego real como `bella_app` (restrito, RLS aplicada), nunca
  // como o dono do banco — ver comentário em config.ts. Cair para DATABASE_URL é só
  // conveniência de desenvolvimento antes de `pnpm db:app-role`; nunca deveria
  // acontecer silenciosamente em produção, daí o warn alto.
  let connectionString = config.APP_DATABASE_URL;
  if (!connectionString && config.DATABASE_URL) {
    connectionString = config.DATABASE_URL;
    console.warn(
      'AVISO: APP_DATABASE_URL não definida — a API vai conectar como o DONO do banco ' +
        '(DATABASE_URL), o que ignora o isolamento por tenant (RLS). Rode `pnpm db:app-role` ' +
        'e defina APP_DATABASE_URL antes de expor isto a tráfego real.',
    );
  }

  const db = connectionString ? createDb(connectionString) : null;
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
