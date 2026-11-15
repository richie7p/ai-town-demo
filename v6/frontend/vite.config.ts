import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開發時把 /api 轉給 FastAPI（預設 http://127.0.0.1:8000）
const backend = process.env.AI_TOWN_BACKEND ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': backend } },
  build: { chunkSizeWarningLimit: 2000 },
});
