import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the production bundle can be opened directly from the
// filesystem (file://) or served from any sub-path on a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
})
