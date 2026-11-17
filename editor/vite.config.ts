import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined, // components mount with the browser build of Svelte in tests
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
