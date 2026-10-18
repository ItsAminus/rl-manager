import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            copyPublicDir: false,
            rollupOptions: {
              external: ['sql.js']
            }
          },
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src')
            }
          }
        }
      },
      preload: {
        input: path.join(__dirname, 'src/main/preload.ts'),
        vite: {
          build: { copyPublicDir: false },
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src')
            }
          }
        }
      },
      renderer: {}
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    emptyOutDir: true,
    copyPublicDir: false,
  }
});
