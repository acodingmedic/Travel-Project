import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8'
    },
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'logs/**',
      'public/**'
    ]
  }
});