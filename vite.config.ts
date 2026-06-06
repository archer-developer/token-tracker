import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

export default defineConfig({
  // /token-tracker/ when building in GitHub Actions, / elsewhere
  base: process.env.GITHUB_ACTIONS ? '/token-tracker/' : '/',
  plugins: [
    tailwindcss(),
    react(),
    // HTTPS only needed for local dev server
    ...(process.env.GITHUB_ACTIONS ? [] : [basicSsl()]),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Tokens Tracker',
        short_name: 'Tokens',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.nbrb\.by\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'nbrb-api' },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { lines: 70, functions: 70, branches: 70 },
    },
  },
})
