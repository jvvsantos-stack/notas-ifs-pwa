import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // O manifest também existe como arquivo estático em public/manifest.json
      // (conforme solicitado), mas o plugin gera e injeta o seu próprio a
      // partir da config abaixo — mantenha os dois em sincronia se editar.
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Acompanhamento de Turmas - IFS Eletrônica',
        short_name: 'Notas IFS',
        description: 'Acompanhamento de turmas, alunos e notas — Instituto Federal de Sergipe',
        theme_color: '#059669',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Nunca cacheia chamadas de API do Supabase de forma "cache-first":
        // o SyncManager (IndexedDB) já é a camada de offline para dados de
        // notas. Aqui cacheamos GETs de leitura (dashboard, listagens) com
        // NetworkFirst só para acelerar recarregamentos com rede lenta.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
