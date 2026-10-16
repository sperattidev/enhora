import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { mockApi } from './dev/mock-api';

// In development the API runs on :3000 and is proxied, so cookies stay same-origin.
const API_PATHS = ['/auth', '/jobs', '/admin', '/courier', '/health', '/t/'];

export default defineConfig(({ mode }) => {
  // `vite --mode mock` serves an in-memory API for design reviews without a database.
  const MOCK = mode === 'mock';
  return {
    plugins: [
      MOCK && mockApi(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'EnHora — Comercios',
          short_name: 'EnHora',
          description: 'Pedí un cadete en segundos.',
          lang: 'es-AR',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/envios',
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        workbox: {
          // Never cache API answers: envíos change every few seconds.
          navigateFallbackDenylist: API_PATHS.map((p) => new RegExp(`^${p}`)),
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: MOCK
        ? undefined
        : Object.fromEntries(API_PATHS.map((p) => [p, { target: 'http://localhost:3000', changeOrigin: false }])),
    },
    worker: { format: 'es' },
    build: {
      // MapLibre alone is ~1 MB and is already loaded on demand.
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['@enhora/ui/test-setup'],
      css: false,
    },
  };
});
