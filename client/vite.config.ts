import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exerciseMediaPlugin } from '../scripts/exercise-media-assets.mjs';

export default defineConfig({
  plugins: [
    react(),
    exerciseMediaPlugin(),
    
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
