import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

const COMMIT_COUNT = (() => {
  try { return execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(); }
  catch { return '0'; }
})();

export default defineConfig({
  root: '.',
  base: '/BoardGameSimulator/',
  define: { __COMMIT_COUNT__: JSON.stringify(COMMIT_COUNT) },
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
      },
      manifest: {
        name: 'BoardGame',
        short_name: '桌游',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/BoardGameSimulator/assets/icons/app-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
});
