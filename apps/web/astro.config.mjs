import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

// Static-first: pages prerender at build time; routes that must run per request opt out with
// `export const prerender = false` and run in the Worker. Images are optimised at build time.
export default defineConfig({
  site: 'https://critterpass.app',
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
});
