import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import { shippedLocaleCodes } from '../../packages/i18n/src/locales.ts';

const SITE = 'https://critterpass.app';

// Static-first: pages prerender at build time; routes that must run per request opt out with
// `export const prerender = false` and run in the Worker. Images are optimised at build time.
export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  // Tips and legal documents are MDX from @cp/content; the sitemap lists every public page (the
  // server-rendered front doors, one per language, are added by hand; link pages are private and
  // never listed).
  integrations: [
    mdx(),
    sitemap({
      customPages: [
        `${SITE}/`,
        ...shippedLocaleCodes.map((code) => `${SITE}/${code}`),
        `${SITE}/r`,
        `${SITE}/j`,
      ],
      filter: (page) => !/\/(404|og)\b/u.test(page),
    }),
  ],
  // Every page's CSS ships inside its HTML: no render-blocking stylesheet requests on first load.
  // Pages are `<path>.html`, so every URL is served without a trailing slash (no redirect hop).
  build: { inlineStylesheets: 'always', format: 'file' },
  trailingSlash: 'never',
  vite: {
    // Draft tips and draft legal versions show everywhere except a production bundle.
    define: { __SHOW_DRAFTS__: JSON.stringify(process.env['CLOUDFLARE_ENV'] !== 'production') },
  },
});
