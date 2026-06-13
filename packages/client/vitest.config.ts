import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@ipp/protocol': resolve(__dirname, '../protocol/src/index.ts'),
      '@ipp/codec':    resolve(__dirname, '../codec/src/index.ts'),
    },
  },
});
