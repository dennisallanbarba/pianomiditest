import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pianomiditest/',
  optimizeDeps: {
    include: ['vexflow', '@tonejs/midi'],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    commonjsOptions: {
      include: [/vexflow/, /node_modules/],
    }
  }
})
