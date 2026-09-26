import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://critterpass.app',
  output: 'server',
  adapter: cloudflare(),
});
