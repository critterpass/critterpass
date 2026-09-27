import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server stands in for the admin Worker: it serves the SPA and proxies /v1/admin/* to the
// local api without rewriting Origin, so the console's session cookie stays same-origin.
const apiOrigin = process.env['ADMIN_API_ORIGIN'] ?? 'http://localhost:8787';
const port = Number(process.env['ADMIN_DEV_PORT'] ?? 5173);
const host = process.env['ADMIN_DEV_HOST'] ?? 'localhost';

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port,
    strictPort: true,
    proxy: { '/v1/admin': { target: apiOrigin, changeOrigin: false } },
  },
  preview: { port, strictPort: true },
});
