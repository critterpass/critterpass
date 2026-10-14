/**
 * Place research on the web: our own SearXNG (private network) for web pages and images, paced by
 * one slot reservation shared by every worker (`app.reserve_place_search`) and rotated over the
 * enabled engines, two per query, so the scraped engines behind it never see a burst. Tavily is
 * the fallback only when SearXNG returns fewer than five usable results. Queries carry the place's
 * names, the town and topics only (D23). Two domain policies: `facts` (fees, hours, dress) leaves
 * out supplier, review, map, Foursquare, social and pin-board pages; `suggestions` (which places a
 * brief names, a popular place's tips) also reads social posts, forums and any travel blog.
 */
import {
  isBlockedUrl,
  SUPPLIER_BLOCKED_DOMAINS,
  type ProfilePage,
  type SearchProvider,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export type ResearchPolicy = 'facts' | 'suggestions';

/** Never read for anything: suppliers (D23), Foursquare pages (D24) and pin boards. */
export const SUGGESTION_EXCLUDED_DOMAINS: readonly string[] = [
  ...SUPPLIER_BLOCKED_DOMAINS,
  'foursquare.com',
  '4sqi.net',
  'pinterest.com',
  'pinimg.com',
];

/** Never read for a fee, hours or a dress rule: the above, social posts and forums too. */
export const EXCLUDED_DOMAINS: readonly string[] = [
  ...SUGGESTION_EXCLUDED_DOMAINS,
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'reddit.com',
];

export const SOCIAL_RESEARCH_SWITCH = 'places.social_research.enabled';

/** `suggestions` (blogs and social posts too) for briefs and tips unless the switch is off. */
export async function researchPolicy(pool: pg.Pool): Promise<ResearchPolicy> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ value: unknown }>(
      'SELECT value FROM ops.ops_config WHERE key = $1',
      [SOCIAL_RESEARCH_SWITCH],
    );
    return rows[0]?.value === false ? 'facts' : 'suggestions';
  });
}

const excludedFor = (policy: ResearchPolicy) =>
  policy === 'facts' ? EXCLUDED_DOMAINS : SUGGESTION_EXCLUDED_DOMAINS;

export function isExcludedUrl(url: string, policy: ResearchPolicy = 'facts'): boolean {
  let host: string;
  try {
    host = new URL(url.startsWith('//') ? `https:${url}` : url).hostname.replace(/^www\./u, '');
  } catch {
    return true;
  }
  return isBlockedUrl(url) || excludedFor(policy).some((d) => host === d || host.endsWith(`.${d}`));
}

export interface ImageHit {
  readonly src: string;
  readonly sourcePage: string;
  readonly engine: string | null;
}

export interface PlaceSearch {
  web(
    query: string,
    language: string,
    signal?: AbortSignal,
    policy?: ResearchPolicy,
  ): Promise<ProfilePage[]>;
  images(query: string, language: string, signal?: AbortSignal): Promise<ImageHit[]>;
}

export interface PlaceSearchOptions {
  readonly searxUrl: string;
  readonly engines: readonly string[];
  /** Shared gap between searches (ms). */
  readonly gapMs: number;
  readonly pool: pg.Pool;
  readonly tavily?: SearchProvider | undefined;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface SearxResult {
  readonly url?: string;
  readonly title?: string;
  readonly content?: string;
  readonly img_src?: string;
  readonly thumbnail_src?: string;
  readonly engine?: string;
}

/** Fewer usable SearXNG results than this and Tavily is asked as well. */
export const MIN_WEB_RESULTS = 5;

/** The two engines slot `seq` uses: consecutive pairs around the list. */
export function enginesFor(seq: number, engines: readonly string[]): string[] {
  if (engines.length <= 2) return [...engines];
  const first = (seq * 2) % engines.length;
  return [engines[first], engines[(first + 1) % engines.length]].filter(
    (e): e is string => e !== undefined,
  );
}

export function createPlaceSearch(options: PlaceSearchOptions): PlaceSearch {
  const send = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = options.searxUrl.replace(/\/+$/u, '');

  async function slot(signal?: AbortSignal): Promise<number> {
    const { wait_ms, seq } = await withSystem(options.pool, async (tx) => {
      const { rows } = await tx.query<{ wait_ms: number; seq: string }>(
        'SELECT wait_ms, seq FROM app.reserve_place_search($1)',
        [options.gapMs],
      );
      return rows[0] ?? { wait_ms: 0, seq: '0' };
    });
    if (wait_ms > 0) await sleep(wait_ms);
    signal?.throwIfAborted();
    return Number(seq);
  }

  async function searx(
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<SearxResult[]> {
    const query = new URLSearchParams({ format: 'json', ...params });
    try {
      const response = await send(`${base}/search?${query}`, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      });
      if (!response.ok) return [];
      return ((await response.json()) as { results?: SearxResult[] }).results ?? [];
    } catch {
      // A failed or slow SearXNG answer counts as no results; a cancelled job stops here.
      signal?.throwIfAborted();
      return [];
    }
  }

  return {
    async web(query, language, signal, policy = 'facts') {
      const seq = await slot(signal);
      const engines = enginesFor(seq, options.engines);
      const results = await searx(
        {
          q: query,
          language,
          categories: 'general',
          ...(engines.length > 0 ? { engines: engines.join(',') } : {}),
        },
        signal,
      );
      const pages: ProfilePage[] = results
        .filter((r): r is SearxResult & { url: string } => typeof r.url === 'string')
        .filter((r) => !isExcludedUrl(r.url, policy))
        .map((r) => ({ url: r.url, title: r.title ?? '', text: r.content ?? '' }));
      if (pages.length >= MIN_WEB_RESULTS || options.tavily === undefined) return pages;
      const hits = await options.tavily
        .search(
          { query, maxResults: 8, excludeDomains: [...excludedFor(policy)], topic: 'general' },
          signal,
        )
        .catch(() => []);
      const seen = new Set(pages.map((p) => p.url));
      for (const hit of hits) {
        if (seen.has(hit.url) || isExcludedUrl(hit.url, policy)) continue;
        seen.add(hit.url);
        pages.push({ url: hit.url, title: hit.title, text: hit.content });
      }
      return pages;
    },

    async images(query, language, signal) {
      await slot(signal);
      const results = await searx({ q: query, language, categories: 'images' }, signal);
      return results.flatMap((r) => {
        const src = r.img_src ?? r.thumbnail_src;
        if (src === undefined || r.url === undefined) return [];
        if (isExcludedUrl(src) || isExcludedUrl(r.url)) return [];
        return [
          {
            src: src.startsWith('//') ? `https:${src}` : src,
            sourcePage: r.url,
            engine: r.engine ?? null,
          },
        ];
      });
    },
  };
}
