import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-demo',
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_SERVER_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

