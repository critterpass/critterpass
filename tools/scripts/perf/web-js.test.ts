import { describe, expect, it } from 'vitest';

import { measureWebJs, pageScripts, staticImports } from './web-js';

describe('page JavaScript weight', () => {
  const html = `<html><head>
    <link rel="modulepreload" href="/_astro/shared.js">
    <link rel="stylesheet" href="/_astro/site.css">
    <script type="application/ld+json">{"@type":"WebSite"}</script>
    <script type="module" src="/_astro/page.js"></script>
    <script>window.x = 1;</script>
    <script src="https://cdn.example/analytics.js"></script>
  </head></html>`;

  it('collects scripts and module preloads, not data blocks or styles', () => {
    const scripts = pageScripts(html, 'https://site.example/i/abc');
    expect(scripts.urls).toEqual([
      'https://site.example/_astro/page.js',
      'https://cdn.example/analytics.js',
      'https://site.example/_astro/shared.js',
    ]);
    expect(scripts.inline).toEqual(['window.x = 1;']);
  });

  it('follows static imports only', () => {
    const code = `import{a}from"./chunk.js";import"./side.js";export*from'../up.js';const l=()=>import("./lazy.js");`;
    expect(staticImports(code, 'https://site.example/_astro/page.js')).toEqual([
      'https://site.example/_astro/chunk.js',
      'https://site.example/_astro/side.js',
      'https://site.example/up.js',
    ]);
  });

  it('weighs each file once, following same-origin imports', async () => {
    const files: Record<string, string> = {
      'https://site.example/i/abc': html,
      'https://site.example/_astro/page.js': 'import"./shared.js";import"./chunk.js";',
      'https://site.example/_astro/shared.js': 'x'.repeat(1000),
      'https://site.example/_astro/chunk.js': 'import"https://other.example/far.js";',
      'https://cdn.example/analytics.js': 'y'.repeat(500),
    };
    const fetched: string[] = [];
    const result = await measureWebJs('https://site.example/i/abc', (url) => {
      fetched.push(url);
      const body = files[url];
      return body === undefined ? Promise.reject(new Error(url)) : Promise.resolve(body);
    });
    expect(fetched.filter((url) => url.endsWith('shared.js'))).toHaveLength(1);
    expect(result.files).toBe(5);
    expect(result.rawKb).toBe(1.6);
    expect(result.gzipKb).toBeLessThan(result.rawKb);
  });
});
