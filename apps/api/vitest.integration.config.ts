import { defineConfig } from 'vitest/config';

// Testes de integração exigem Postgres real (TEST_DATABASE_URL). Ver docs/TESTING_STRATEGY.md.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
