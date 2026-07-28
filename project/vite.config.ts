import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('repo/frontend', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'repo/frontend/index.html'),
        login: resolve(process.cwd(), 'repo/frontend/login.html'),
        dashboard: resolve(process.cwd(), 'repo/frontend/dashboard.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
