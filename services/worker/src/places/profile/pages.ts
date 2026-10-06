/**
 * Our own fetch of the top search results: plain text from the HTML, clipped to a window that
 * starts a little before the page's first mention of the place, so the write reads the part that
 * is about it and a quote can be checked against exactly what the model saw.
 */
import type { ProfilePage } from '@cp/ai';

export const USER_AGENT = 'Mozilla/5.0 (compatible; CritterPass/1.0; +https://critterpass.app)';
const PAGE_CHARS = 7_000;
const MIN_PAGE_CHARS = 300;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

const fold = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase();

/** The text from a little before its first mention of any of `near`, clipped. */
export function pageWindow(text: string, near: readonly string[]): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const folded = fold(flat);
  const hits = near
    .filter((name) => name.length > 2)
    .map((name) => folded.indexOf(fold(name)))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const start = Math.max(0, (hits[0] ?? 0) - 500);
  return flat.slice(start, start + PAGE_CHARS);
}

/** Visible text of an HTML document: scripts and styles out, tags out, common entities decoded. */
export function htmlText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([^<]*)/iu.exec(html)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, n: string) => String.fromCodePoint(Number(n)));
  return { title, text };
}

/** One page's window, or null when it will not load, is not HTML, or barely mentions anything. */
export async function fetchPage(
  url: string,
  near: readonly string[],
  options: { readonly fetch?: typeof fetch; readonly signal?: AbortSignal } = {},
): Promise<ProfilePage | null> {
  const send = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(8_000);
  try {
    const response = await send(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? 'text/html').includes('html')) return null;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const { title, text } = htmlText(html);
    const clipped = pageWindow(text, near);
    return clipped.length < MIN_PAGE_CHARS ? null : { url, title, text: clipped };
  } catch {
    options.signal?.throwIfAborted();
    return null;
  }
}

/** The first `want` candidates that load, in rank order, fetched together. */
export async function fetchTopPages(
  urls: readonly string[],
  near: readonly string[],
  want: number,
  options: { readonly fetch?: typeof fetch; readonly signal?: AbortSignal } = {},
): Promise<ProfilePage[]> {
  const unique = [...new Set(urls)].slice(0, want + 2);
  const pages = await Promise.all(unique.map((url) => fetchPage(url, near, options)));
  return pages.filter((page): page is ProfilePage => page !== null).slice(0, want);
}
