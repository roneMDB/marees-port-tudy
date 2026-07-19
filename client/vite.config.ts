/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Marées Navihan – Belz',
        short_name: 'Navihan',
        description: 'Horaires de marées Navihan (Belz), dérivés de Port-Tudy (île de Groix).',
        lang: 'fr',
        theme_color: '#0a4b8c',
        background_color: '#0a4b8c',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Coquille de l'app (JS/CSS/HTML) précachée → chargement hors-ligne.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // API : réseau d'abord, repli sur le cache si hors-ligne (dernières données vues).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      // En dev, redirige l'API vers le serveur Express.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
