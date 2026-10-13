import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    
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
