import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/esm',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'shieldbase-widget.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
    },
  },
})

