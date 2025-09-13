import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for TravelAI frontend
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
    // Proxy not configured; backend runs on 8000 and frontend uses absolute API URLs
  },
  preview: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  },
  publicDir: 'public',
  resolve: {
    alias: {
      path: 'path-browserify'
    }
  },
  define: {
    // Allow simple checks like process.env.NODE_ENV in frontend code
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
});