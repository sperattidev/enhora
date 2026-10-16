import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests run the real app against a migrated PostGIS database (see the CI "e2e" job).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e.test.ts'],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
