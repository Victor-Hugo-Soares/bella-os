import { defineConfig } from 'vitest/config';

// Testes unitários puros (sem banco). Integração real fica em apps/api/test/integration.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
