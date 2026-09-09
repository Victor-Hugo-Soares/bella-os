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
  // pelos pacotes do workspace (pg, drizzle-orm, zod) precisam constar aqui explicitamente,
  // senão o tsup as embute e módulos CommonJS (pg) quebram dentro de ESM.
  noExternal: [/^@bella\//],
  external: ['pg', 'pg-native', 'drizzle-orm', 'zod'],
});
