/**
 * JavaScript weight of one web page (§9: ≤100 KB on the invite landing): every script the HTML
 * loads (inline, `<script src>`, `modulepreload`) plus the modules those import statically,
 * fetched once each. Reports raw and gzip sizes in KB (10^3 bytes); the budget is checked against
 * the gzip size, which is what a phone downloads.
 */
import { gzipSync } from 'node:zlib';

export interface PageScripts {
  readonly urls: readonly string[];
  readonly inline: readonly string[];
}

/** Scripts an HTML document loads up front. JSON and other non-script `<script>` types are data. */
export function pageScripts(html: string, pageUrl: string): PageScripts {
  const urls = new Set<string>();
  const inline: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
    const attrs = m[1] ?? '';
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/iu.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== 'module' && !type.includes('javascript')) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1];
    if (src) urls.add(new URL(src, pageUrl).href);
    else if ((m[2] ?? '').trim()) inline.push(m[2] ?? '');
  }
  for (const m of html.matchAll(/<link\b[^>]*>/giu)) {
    if (!/\brel\s*=\s*["']?modulepreload/iu.test(m[0])) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(m[0])?.[1];
    if (href) urls.add(new URL(href, pageUrl).href);
  }
  return { urls: [...urls], inline };
}

/** Static `import` specifiers of a module that are paths (dynamic `import()` loads on demand). */
export function staticImports(code: string, moduleUrl: string): string[] {
  const found = code.matchAll(
    /(?:^|[;}\s])(?:import|export)\s*(?:[\w*${}\s,]+from\s*)?["']((?:\.{1,2}\/|\/)[^"']+)["']/gu,
  );
  return [...new Set([...found].map((m) => new URL(m[1] ?? '', moduleUrl).href))];
}

const kb = (bytes: number) => Math.round(bytes / 100) / 10;

export interface WebJsResult {
  readonly rawKb: number;
  readonly gzipKb: number;
  readonly files: number;
}

export function weigh(sources: readonly string[]): WebJsResult {
  const raw = sources.reduce((sum, code) => sum + Buffer.byteLength(code), 0);
  const gzip = sources.reduce((sum, code) => sum + gzipSync(code).length, 0);
  return { rawKb: kb(raw), gzipKb: kb(gzip), files: sources.length };
}

/** Fetches the page and its script graph (same origin only) and weighs it. */
export async function measureWebJs(
  pageUrl: string,
  get: (url: string) => Promise<string> = async (url) => (await fetch(url)).text(),
): Promise<WebJsResult> {
  const origin = new URL(pageUrl).origin;
  const { urls, inline } = pageScripts(await get(pageUrl), pageUrl);
  const sources = [...inline];
  const queue = [...urls];
  const seen = new Set(queue);
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    const code = await get(url);
    sources.push(code);
    for (const next of staticImports(code, url)) {
      if (!seen.has(next) && new URL(next).origin === origin) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return weigh(sources);
}
