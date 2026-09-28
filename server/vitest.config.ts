import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // The reminder tests are time-sensitive; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Tests share one PostgreSQL schema, so they must not run concurrently.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
