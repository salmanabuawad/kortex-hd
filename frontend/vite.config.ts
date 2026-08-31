import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // AG Grid is by far the largest dependency and only the grid pages need
        // it; splitting keeps the first paint off the critical path of a 1.5 MB
        // bundle. i18n and the router are separated for the same reason.
        manualChunks: {
          'ag-grid': ['ag-grid-community', 'ag-grid-react'],
          i18n: ['i18next', 'react-i18next'],
          router: ['react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
