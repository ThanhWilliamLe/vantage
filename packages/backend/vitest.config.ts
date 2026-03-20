import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/test-helpers.ts',
        'src/server.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
      },
    },
  },
});
