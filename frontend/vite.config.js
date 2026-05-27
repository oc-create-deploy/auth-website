import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env.VITE_BACKEND_PROXY || 'http://localhost:3000';
const slotApiUrl = process.env.VITE_SLOT_API_PROXY || 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backendUrl,
      '/slot-api': {
        target: slotApiUrl,
        rewrite: (path) => path.replace(/^\/slot-api/, '/api')
      }
    }
  }
});
