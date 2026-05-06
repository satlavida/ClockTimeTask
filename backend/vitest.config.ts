import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(__dirname, 'test/mocks/cloudflare-workers.ts'),
    },
  },
});
