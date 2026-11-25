import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/hub': {
        target: 'http://localhost:8181',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
