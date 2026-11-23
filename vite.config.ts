import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: the same build works on Netlify, Vercel and GitHub Pages sub-paths.
  base: './',
  plugins: [react()],
  // LAN exposure is opt-in for device testing: pnpm dev --host
  server: { port: 5175 },
  build: { target: 'es2022', sourcemap: true },
});
