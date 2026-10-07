import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { unstable_readConfig } from 'wrangler';

import { shippedLocaleCodes } from '../../packages/i18n/src/locales.ts';
import { comingSoonSitemapPaths, isComingSoonPath } from './src/lib/coming-soon-surface.ts';

const SITE = 'https://critterpass.app';

// Whether this build is for a Worker that serves the coming-soon page: the same `SITE_MODE`
// variable the Worker reads, taken from wrangler.jsonc for the environment being built
// (`CLOUDFLARE_ENV`). A `SITE_MODE` in the build's own environment wins, for local and test builds.
const workerVars = unstable_readConfig(
  {
    config: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
    env: process.env['CLOUDFLARE_ENV'],
  },
  { hideWarnings: true },
).vars;
const comingSoon = (process.env['SITE_MODE'] ?? workerVars['SITE_MODE']) === 'coming-soon';
const onSurface = (pathname) => isComingSoonPath(pathname, shippedLocaleCodes);

/** The address a prerendered file answers at: `tips/pack-light.html` -> `/tips/pack-light`. */
function addressOf(file) {
  const path = `/${file}`.replace(/\.html$/u, '').replace(/\/index$/u, '');
  return path === '' ? '/' : path;
}

/**
 * A coming-soon build ships the coming-soon surface only. Prerendered pages are served as files
 * without running the Worker, so the Worker could not refuse them: the ones outside the surface
 * (tips, legal documents, the feed) are taken out of the build's output, and their addresses then
 * reach the Worker, which answers 404 like every other route it gates (src/middleware.ts). The
 * 404 page renders on demand in such a build, so it can answer in the visitor's language.
 */
function comingSoonSurface() {
  return {
    name: 'coming-soon-surface',
    hooks: {
      'astro:route:setup': ({ route }) => {
        if (comingSoon && /src\/pages\/404\.astro$/u.test(route.component)) route.prerender = false;
      },
      'astro:build:done': async ({ dir, assets, logger }) => {
        if (!comingSoon) return;
        const client = fileURLToPath(dir);
        const pages = (await readdir(client, { recursive: true })).filter(
          (file) => file.endsWith('.html') && !onSurface(addressOf(file)),
        );
        // Prerendered endpoints (the feed) are not pages: the build reports them per route.
        const endpoints = [...assets]
          .filter(([route]) => !onSurface(route))
          .flatMap(([, files]) => files.map((file) => fileURLToPath(file)))
          .filter((file) => !file.endsWith('.html'));
        for (const file of pages) await rm(join(client, file), { force: true });
        for (const file of endpoints) await rm(file, { force: true });
        logger.info(`coming-soon build: left out ${pages.length + endpoints.length} files`);
      },
    },
  };
}

// Static-first: pages prerender at build time; routes that must run per request opt out with
// `export const prerender = false` and run in the Worker. Images are optimised at build time.
export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  // Tips and legal documents are MDX from @cp/content; the sitemap lists every public page (the
  // server-rendered front doors are added by hand; link pages are private and never listed). A
  // coming-soon build lists the front door, each language's address and the privacy page only.
  integrations: [
    mdx(),
    sitemap(
      comingSoon
        ? {
            customPages: comingSoonSitemapPaths(shippedLocaleCodes).map((path) => `${SITE}${path}`),
            filter: (page) => onSurface(new URL(page).pathname),
          }
        : {
            customPages: [`${SITE}/`, `${SITE}/pricing`, `${SITE}/r`, `${SITE}/j`],
            filter: (page) => !/\/(404|og)\b/u.test(page),
          },
    ),
    comingSoonSurface(),
  ],
  // Every page's CSS ships inside its HTML: no render-blocking stylesheet requests on first load.
  // Pages are `<path>.html`, so every URL is served without a trailing slash (no redirect hop).
  build: { inlineStylesheets: 'always', format: 'file' },
  trailingSlash: 'never',
  vite: {
    // Draft tips and draft legal versions show everywhere except a production bundle.
    define: {
      __SHOW_DRAFTS__: JSON.stringify(process.env['CLOUDFLARE_ENV'] !== 'production'),
      __COMING_SOON_BUILD__: JSON.stringify(comingSoon),
    },
  },
});
