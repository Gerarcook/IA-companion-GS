// electron.vite.config.mts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // ---------- MAIN ----------
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      outDir: path.resolve(__dirname, 'dist/main'),
      emptyOutDir: true,
      rollupOptions: {
        external: ['electron', 'ws', 'node-fetch', 'dotenv', 'sql.js'],
      },
    },
  },

  // ---------- PRELOAD ----------
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      outDir: path.resolve(__dirname, 'dist/preload'),
      emptyOutDir: true,
      rollupOptions: {
        external: ['electron'],
      },
    },
  },

  // ---------- RENDERER ----------
  renderer: {
    plugins: [react()],
    root: path.resolve(__dirname, 'src/renderer'),
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  },
});