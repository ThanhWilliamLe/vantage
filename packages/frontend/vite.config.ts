import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:24020' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'tanstack': ['@tanstack/react-query', '@tanstack/react-router'],
          'charts': ['recharts'],
          'utils': ['date-fns', 'cmdk'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
