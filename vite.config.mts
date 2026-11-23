import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900, sourcemap: false },
  server: {
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3101', changeOrigin: false } },
  },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:3101' } } },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}', 'tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
