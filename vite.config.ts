import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import path from 'path';

const COMMIT_COUNT = (() => {
  try { return execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(); }
  catch { return '0'; }
})();

export default defineConfig({
  root: '.',
  base: '/BoardGameSimulator/',
  define: { '__COMMIT__': JSON.stringify(COMMIT_COUNT) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'docs',
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      input: { main: 'index.html', diag: 'diag.html', diag6: 'diag6.html' },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  worker: { format: 'es' },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use "sass:math";
          @use "sass:map";
        `,
        api: 'modern-compiler',
      },
    },
  },
  plugins: [
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
