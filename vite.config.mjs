import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    modulePreload: {
      polyfill: false,
    },
    sourcemap: false,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
  },
});
