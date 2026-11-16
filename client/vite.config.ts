import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exerciseMediaPlugin } from '../scripts/exercise-media-assets.mjs';
import {poseAssetsPlugin} from '../scripts/pose-assets.mjs';

export default defineConfig({
  // Production CDN shell (2026-11-16): cloudflare/scripts/web.mjs sets
  // MOVEMATE_SHELL_BASE only for production builds (npm run
  // build:web:production), pointing the emitted asset URLs at the NoDepend
  // CDN host that origin-pulls this very dist. Every other build (preview,
  // local, Vercel) leaves it unset and keeps the origin base '/'.
  base: process.env.MOVEMATE_SHELL_BASE || '/',
  plugins: [
    react(),
    exerciseMediaPlugin(),
    poseAssetsPlugin(),
    
  ],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
  define: {
    'import.meta.env.VITE_WEBSOCKET_ONLY': JSON.stringify(process.env.VERCEL ? 'true' : process.env.VITE_WEBSOCKET_ONLY || 'false'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true, ws:true,
      },
      '/ai': { target:'http://localhost:3001', changeOrigin:true },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
