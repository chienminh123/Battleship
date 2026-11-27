import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.BATTLESHIP_DEV_SERVER ?? 'http://localhost:8181', changeOrigin: true },
      '/hub': {
        target: process.env.BATTLESHIP_DEV_SERVER ?? 'http://localhost:8181',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
