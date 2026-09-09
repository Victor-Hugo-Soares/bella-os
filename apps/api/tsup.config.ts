import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Pacotes do workspace (@bella/*) exportam .ts e são empacotados junto.
  // Dependências npm ficam externas: as do apps/api são detectadas pelo tsup; as usadas
  // pelos pacotes do workspace (pg, drizzle-orm, zod, @node-rs/argon2) precisam constar
  // aqui explicitamente, senão o tsup tenta embutí-las. `@node-rs/argon2` PRECISA ficar
  // external: seu index.js tem um require() condicional para o binário .node de cada
  // plataforma (win32/darwin/linux/android, x64/arm64/ia32); o esbuild tenta resolver
  // todos estaticamente e falha porque só o da plataforma atual existe em node_modules
  // (mesma classe de bug do `pg` no M0 — achado de verdade rodando `pnpm build`, não
  // hipótese).
  noExternal: [/^@bella\//],
  external: ['pg', 'pg-native', 'drizzle-orm', 'zod', '@node-rs/argon2'],
});
