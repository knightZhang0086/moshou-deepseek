import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对路径，便于 GitHub Pages 子路径/任意静态托管
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    port: 5173,
    host: true,
  },
});
