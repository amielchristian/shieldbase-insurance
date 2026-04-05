import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/iife',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      name: 'ShieldBaseWidget',
      formats: ['iife'],
      fileName: () => 'shieldbase-widget.js',
    },
  },
})

