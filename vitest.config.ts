import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx,mjs}', 'worker/test/**/*.test.ts'],
    environment: 'node',
  },
});
