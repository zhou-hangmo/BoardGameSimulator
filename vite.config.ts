import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'docs',
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 3000,
    open: true,
  },
  worker: { format: 'es' },
  plugins: [basicSsl(), 
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.nostr\.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'nostr-cache', expiration: { maxEntries: 10, maxAgeSeconds: 600 } },
          },
        ],
      },
      manifest: {
        name: 'BoardGame',
        short_name: '桌游',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/assets/icons/app-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
});
