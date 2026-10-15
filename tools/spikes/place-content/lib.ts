/**
 * Spike plumbing for AI place content: one DeepSeek call shaped by the gateway's own request
 * builder, Tavily search and extract with the supplier blocklist (plus Foursquare and Google),
 * an on-disk cache so a rerun spends nothing twice, and a spend ledger. Keys come from the
 * environment (`railway run`); nothing here prints them.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildMessageParams } from '../../../packages/ai/src/client';
import { DEEPSEEK_ANTHROPIC_URL, loadGatewayEnv } from '../../../packages/ai/src/env';
import { computeCostMicros, type TokenUsage } from '../../../packages/ai/src/pricing';
import {
  MODEL_IDS,
  resolveGenerationRoute,
  type RouteConfig,
} from '../../../packages/ai/src/routing';
import { createTavilySearch } from '../../../packages/ai/src/search/tavily';
import { parseStructuredText } from '../../../packages/ai/src/structured';
import {
  isBlockedUrl,
  SUPPLIER_BLOCKED_DOMAINS,
} from '../../../packages/ai/src/tools/blocked-domains';

export const OUT = process.env.SPIKE_OUT ?? '';
if (OUT === '') throw new Error('set SPIKE_OUT to a scratch directory');
mkdirSync(join(OUT, 'cache'), { recursive: true });

/** Supplier sites stay out of web results; Foursquare comes in only as its own API source. */
export const EXCLUDED = [...SUPPLIER_BLOCKED_DOMAINS, 'foursquare.com'];
const excluded = (url: string) => {
  const host = new URL(url).hostname.replace(/^www\./u, '');
  return isBlockedUrl(url) || EXCLUDED.some((d) => host === d || host.endsWith(`.${d}`));
};

export interface Ledger {
  micros: number;
  searches: number;
  extractCredits: number;
  calls: number;
  fsqCalls: number;
}
export const ledger: Ledger = { micros: 0, searches: 0, extractCredits: 0, calls: 0, fsqCalls: 0 };
/** Tavily pay-as-you-go, USD per credit (basic search 1 credit; basic extract 1 per 5 URLs). */
export const TAVILY_USD_PER_CREDIT = 0.008;
const MAX_MICROS = 5_000_000;
const MAX_SEARCHES = 200;

function cached<T>(kind: string, key: unknown, make: () => Promise<T>): Promise<T> {
  const hash = createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 24);
  const file = join(OUT, 'cache', `${kind}-${hash}.json`);
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')) as T);
  return make().then((value) => {
    writeFileSync(file, JSON.stringify(value));
    return value;
  });
}

export interface Page {
  readonly url: string;
  readonly title: string;
  /** Snippet from search, or the extracted page text. */
  readonly text: string;
  readonly publishedAt: string | null;
}

const tavilyKey = () => {
  const key = process.env.TAVILY_API_KEY;
  if (key === undefined || key === '') throw new Error('TAVILY_API_KEY missing');
  return key;
};

/** One basic Tavily search, screened in code too. Counts against the 200-search cap. */
/** Wall time of each search or extract by its first argument, cached runs included. */
export const latencies = new Map<string, number>();

export async function search(query: string, maxResults = 5): Promise<Page[]> {
  const out = await cached('search', { query, maxResults }, async () => {
    const started = performance.now();
    if (ledger.searches >= MAX_SEARCHES) throw new Error('search cap reached');
    ledger.searches += 1;
    const hits = await createTavilySearch({ apiKey: tavilyKey(), timeoutMs: 15_000 }).search({
      query,
      maxResults: maxResults + 3,
      excludeDomains: EXCLUDED,
      topic: 'general',
    });
    const pages = hits
      .filter((hit) => !excluded(hit.url))
      .slice(0, maxResults)
      .map((hit) => ({
        url: hit.url,
        title: hit.title,
        text: hit.content,
        publishedAt: hit.publishedAt,
      }));
    return { pages, ms: Math.round(performance.now() - started) };
  });
  latencies.set(query, out.ms);
  return out.pages;
}

const PAGE_CHARS = 7_000;

/** Tavily extract (basic): page text for up to five URLs, clipped around the place's name. */
export async function extract(urls: readonly string[], near: readonly string[]): Promise<Page[]> {
  const wanted = urls.filter((url) => !excluded(url)).slice(0, 5);
  if (wanted.length === 0) return [];
  const out = await cached('extract', { wanted, near }, async () => {
    const started = performance.now();
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { authorization: `Bearer ${tavilyKey()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ urls: wanted, extract_depth: 'basic', format: 'text' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`extract failed with ${response.status}`);
    const body = (await response.json()) as {
      results?: { url: string; raw_content?: string | null }[];
    };
    const results = body.results ?? [];
    ledger.extractCredits += Math.ceil(results.length / 5);
    const pages = results.map((r) => ({
      url: r.url,
      title: '',
      text: window(r.raw_content ?? '', near),
      publishedAt: null,
    }));
    return { pages, ms: Math.round(performance.now() - started) };
  });
  latencies.set(`extract:${wanted.join(' ')}`, out.ms);
  return out.pages;
}

const FSQ_FIELDS =
  'fsq_place_id,name,distance,location,categories,hours,price,rating,description,tips,website,tel,popularity,date_closed';

/**
 * Foursquare Places (search with premium fields) as one evidence page: the nearest match by name
 * within 300 m, its hours, price tier, rating, description and tips as plain lines to quote.
 */
export async function foursquare(name: string, lat: number, lng: number): Promise<Page[]> {
  const out = await cached('fsq', { name, lat, lng }, async () => {
    const key = process.env.FOURSQUARE_API_KEY;
    if (key === undefined || key === '') throw new Error('FOURSQUARE_API_KEY missing');
    const started = performance.now();
    const params = new URLSearchParams({
      query: name,
      ll: `${lat},${lng}`,
      radius: '300',
      limit: '1',
      fields: FSQ_FIELDS,
    });
    const response = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
      headers: {
        authorization: `Bearer ${key}`,
        'X-Places-Api-Version': '2025-06-17',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    ledger.fsqCalls += 1;
    if (!response.ok) throw new Error(`foursquare failed with ${response.status}`);
    const body = (await response.json()) as { results?: Record<string, unknown>[] };
    const hit = body.results?.[0];
    const ms = Math.round(performance.now() - started);
    if (hit === undefined) return { pages: [] as Page[], ms };
    const hours = (hit.hours as { display?: string } | undefined)?.display;
    const tips = ((hit.tips as { text?: string }[] | undefined) ?? [])
      .map((t) => t.text)
      .filter(Boolean);
    const lines = [
      `Name: ${String(hit.name)}`,
      hours === undefined ? '' : `Hours: ${hours}`,
      hit.price === undefined ? '' : `Price tier: ${String(hit.price)} of 4`,
      hit.rating === undefined ? '' : `Rating: ${String(hit.rating)} of 10`,
      hit.description === undefined ? '' : `Description: ${String(hit.description)}`,
      hit.date_closed === undefined ? '' : `Closed since: ${String(hit.date_closed)}`,
      ...tips.map((t) => `Tip: ${t}`),
    ].filter((l) => l !== '');
    const page: Page = {
      url: `https://foursquare.com/v/${String(hit.fsq_place_id)}`,
      title: `${String(hit.name)} on Foursquare`,
      text: lines.join('\n'),
      publishedAt: null,
    };
    return { pages: [page], ms };
  });
  latencies.set(`fsq:${name}`, out.ms);
  return out.pages;
}

const fold = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase();

/** The page's text from a little before its first mention of the place, clipped. */
export function window(text: string, near: readonly string[]): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const folded = fold(flat);
  const hits = near
    .map((name) => folded.indexOf(fold(name)))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const start = Math.max(0, (hits[0] ?? 0) - 500);
  return flat.slice(start, start + PAGE_CHARS);
}

export type Tier = 'fast' | 'pro';

export interface GenerateInput {
  readonly tier: Tier;
  readonly thinking: boolean;
  readonly system: string;
  readonly user: string;
  readonly schema: Record<string, unknown>;
  readonly maxTokens: number;
  /** Cache key prefix; the call is cached by its whole request. */
  readonly label: string;
}

export interface Generated {
  readonly json: unknown;
  readonly usage: TokenUsage;
  readonly costMicros: number;
  readonly ms: number;
}

function routeFor(input: GenerateInput): RouteConfig {
  const base = resolveGenerationRoute('facts.research');
  return {
    ...base,
    tier: input.tier,
    model: MODEL_IDS[input.tier],
    thinking: input.thinking ? 'enabled' : 'disabled',
    effort: input.thinking ? 'high' : undefined,
    temperature: input.thinking ? undefined : 0,
    maxTokens: input.maxTokens,
  };
}

/** One structured DeepSeek call, through the gateway's request builder. */
export function generate(input: GenerateInput): Promise<Generated> {
  const route = routeFor(input);
  const params = buildMessageParams(route, {
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
    outputFormat: { type: 'json_schema', schema: input.schema },
  });
  return cached(`llm-${input.label}`, params, async () => {
    if (ledger.micros >= MAX_MICROS) throw new Error('spend cap reached');
    const env = loadGatewayEnv();
    const base = env.baseURL ?? DEEPSEEK_ANTHROPIC_URL;
    const started = performance.now();
    let body: {
      content?: { type: string; text?: string }[];
      usage?: Record<string, number | undefined>;
    } = {};
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`${base.replace(/\/$/u, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': env.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(240_000),
      });
      if (response.ok) {
        body = (await response.json()) as typeof body;
        break;
      }
      if (attempt === 3 || ![429, 500, 502, 503, 529].includes(response.status)) {
        throw new Error(`model call failed with ${response.status}`);
      }
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
    const ms = Math.round(performance.now() - started);
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    const usage: TokenUsage = {
      inputTokens: body.usage?.input_tokens ?? 0,
      cacheWriteTokens: body.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
    const costMicros = computeCostMicros(input.tier, usage, new Date());
    ledger.micros += costMicros;
    ledger.calls += 1;
    let json: unknown = null;
    try {
      json = parseStructuredText(text);
    } catch {
      json = null;
    }
    return { json, usage, costMicros, ms };
  });
}

export function writeOut(name: string, value: unknown): void {
  writeFileSync(join(OUT, name), JSON.stringify(value, null, 2));
}

export function readOut<T>(name: string): T {
  return JSON.parse(readFileSync(join(OUT, name), 'utf8')) as T;
}

/** Pages as numbered data blocks the model may quote from. */
export function renderPages(pages: readonly Page[]): string {
  return pages
    .map(
      (page, i) =>
        `<page n="${i + 1}" url="${page.url}" title="${page.title.replace(/"/gu, "'")}" date="${page.publishedAt ?? 'unknown'}">\n${page.text}\n</page>`,
    )
    .join('\n\n');
}
