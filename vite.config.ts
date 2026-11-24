import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { shareMeta } from './share-meta';

export default defineConfig({
  // Relative base: the same build works on Netlify, Vercel and GitHub Pages sub-paths.
  base: './',
  plugins: [
    react(),
    // Link-preview tags, JSON-LD, robots.txt and sitemap.xml (set SITE_URL for absolute URLs).
    shareMeta({
      author: 'Oleg Bobokhidze',
      genre: "Wheel of fortune",
      imageAlt: "The Sovereign's Trial by Oleg Bobokhidze: an alchemist beside a parchment-and-crimson fortune wheel.",
      keywords: ["medieval game", "risk wheel", "wheel of fortune", "escalation ladder", "alchemist", "browser game", "canvas", "react", "typescript"],
    }),
  ],
  // LAN exposure is opt-in for device testing: pnpm dev --host
  server: { port: 5175 },
  build: { target: 'es2022', sourcemap: true },
});
