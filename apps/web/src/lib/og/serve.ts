/* eslint-disable lingui/no-unlocalized-strings -- header names, kinds and paths, not UI copy. */
/**
 * `/og/{kind}/{id}.png`. Private kinds (invite, referral) are keyed by the link's code only: the
 * code is checked against the api on every request, so a switched-off or expired code answers 404
 * and its cached card is deleted, and an internal id (not a code) never resolves. A plan card is
 * keyed by its plan link's token and checked the same way: a revoked link or a plan taken down
 * answers 404 and loses its cached card; a recap card is keyed by its recap link's token, and a
 * link switched off answers 404 and loses its card the same way. Public kinds
 * (tip, and page for a site page with a card of its own) are keyed by their public slug. Every card is drawn once per content digest and kept in R2;
 * any failure falls back to the site card.
 */
import { parseLinkPath, type LinkTarget } from '@cp/domain';

import { fetchPublicPlan, fetchPublicRecap } from '../api/public-previews';
import { fetchLinkPreview } from '../links/resolver-fetch';
import { contentDigest, ogCacheKey, readCached, writeCached, type OgBucket } from './cache';
import { linkCard, planCard, recapCard, type CardWords, type DrawnCard } from './cards';
import { renderCard, type AssetLoader } from './render';

/** Bump when a template's drawing changes, so every cached card is redrawn. */
export const OG_TEMPLATE_VERSION = '1';

export const PRIVATE_OG_KINDS = ['invite', 'referral', 'plan', 'recap'] as const;
export const PUBLIC_OG_KINDS = ['tip', 'page'] as const;

export interface OgEnv {
  readonly OG_CACHE?: OgBucket;
  readonly OG_CACHE_SECRET?: string;
}

export interface OgRequest {
  readonly kind: string;
  readonly id: string;
  readonly request: Request;
  readonly apiBaseUrl: string;
  readonly proxySecret: string | undefined;
  readonly env: OgEnv;
  readonly loadAsset: AssetLoader;
  readonly words: CardWords;
  /** Public cards by slug; null when the slug is unknown. */
  readonly publicCard?: (kind: string, slug: string) => Promise<DrawnCard | null>;
}

const NO_STORE = 'no-store';
const PUBLIC_CACHE = 'public, max-age=3600';

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });
}

function png(
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
  cacheControl: string,
  cache: 'hit' | 'miss' | 'fallback',
): Response {
  return new Response(bytes, {
    headers: { 'content-type': 'image/png', 'cache-control': cacheControl, 'x-og-cache': cache },
  });
}

/** The code's own link target, or null when `id` is not a canonical code of that kind. */
function linkTarget(kind: string, id: string): LinkTarget | null {
  const target = parseLinkPath(`/${kind === 'referral' ? 'r' : 'i'}/${id}`);
  if (target === null || (target.kind !== 'invite' && target.kind !== 'referral')) return null;
  return target.code === id ? target : null;
}

async function fallback(loadAsset: AssetLoader): Promise<Response> {
  return png(await loadAsset('/og-image.png'), NO_STORE, 'fallback');
}

async function cacheKey(env: OgEnv, kind: string, id: string): Promise<string | null> {
  if (env.OG_CACHE === undefined || !env.OG_CACHE_SECRET) return null;
  return ogCacheKey(env.OG_CACHE_SECRET, kind, id, OG_TEMPLATE_VERSION);
}

async function drawCached(
  input: OgRequest,
  key: string | null,
  card: DrawnCard,
  cacheControl: string,
): Promise<Response> {
  const digest = await contentDigest(card.content);
  const bucket = input.env.OG_CACHE;
  if (key !== null && bucket !== undefined) {
    const cached = await readCached(bucket, key, digest);
    if (cached.hit) return png(cached.png, cacheControl, 'hit');
  }
  const bytes = await renderCard(card.node, card.stickers, input.loadAsset);
  if (key !== null && bucket !== undefined) await writeCached(bucket, key, digest, bytes);
  return png(bytes, cacheControl, 'miss');
}

async function servePlan(input: OgRequest): Promise<Response> {
  const target = parseLinkPath(`/p/${input.id}`);
  if (target?.kind !== 'plan_share' || target.token !== input.id) return notFound();
  const key = await cacheKey(input.env, 'plan', input.id);
  const outcome = await fetchPublicPlan({
    apiBaseUrl: input.apiBaseUrl,
    target,
    visitorIp: input.request.headers.get('cf-connecting-ip'),
    visitorUserAgent: input.request.headers.get('user-agent'),
    proxySecret: input.proxySecret,
  });
  if (outcome.status === 'unavailable') return fallback(input.loadAsset);
  if (outcome.status === 'gone') {
    if (key !== null) await input.env.OG_CACHE?.delete(key);
    return notFound();
  }
  return drawCached(input, key, planCard(outcome.plan, input.words), NO_STORE);
}

async function serveRecap(input: OgRequest): Promise<Response> {
  const target = parseLinkPath(`/rc/${input.id}`);
  if (target?.kind !== 'recap_share' || target.token !== input.id) return notFound();
  const key = await cacheKey(input.env, 'recap', input.id);
  const outcome = await fetchPublicRecap({
    apiBaseUrl: input.apiBaseUrl,
    target,
    visitorIp: input.request.headers.get('cf-connecting-ip'),
    visitorUserAgent: input.request.headers.get('user-agent'),
    proxySecret: input.proxySecret,
  });
  if (outcome.status === 'unavailable') return fallback(input.loadAsset);
  if (outcome.status === 'gone') {
    if (key !== null) await input.env.OG_CACHE?.delete(key);
    return notFound();
  }
  return drawCached(input, key, recapCard(outcome.recap, input.words), NO_STORE);
}

export async function serveOg(input: OgRequest): Promise<Response> {
  const { kind, id } = input;
  try {
    if ((PUBLIC_OG_KINDS as readonly string[]).includes(kind)) {
      const card = (await input.publicCard?.(kind, id)) ?? null;
      if (card === null) return notFound();
      return await drawCached(input, await cacheKey(input.env, kind, id), card, PUBLIC_CACHE);
    }
    if (!(PRIVATE_OG_KINDS as readonly string[]).includes(kind)) return notFound();
    if (kind === 'plan') return await servePlan(input);
    if (kind === 'recap') return await serveRecap(input);
    const target = linkTarget(kind, id);
    if (target === null) return notFound();
    const key = await cacheKey(input.env, kind, id);
    const preview = await fetchLinkPreview({
      apiBaseUrl: input.apiBaseUrl,
      target,
      channel: null,
      visitorIp: input.request.headers.get('cf-connecting-ip'),
      visitorUserAgent: input.request.headers.get('user-agent'),
      proxySecret: input.proxySecret,
    });
    if (preview.status === 'unavailable') return await fallback(input.loadAsset);
    const gone =
      preview.status === 'not_found' ||
      preview.preview.state === 'expired' ||
      preview.preview.state === 'revoked';
    if (gone) {
      if (key !== null) await input.env.OG_CACHE?.delete(key);
      return notFound();
    }
    return await drawCached(
      input,
      key,
      linkCard(target, id, preview.preview, input.words),
      NO_STORE,
    );
  } catch (error) {
    console.error('og: card failed, serving the site card', error);
    return fallback(input.loadAsset);
  }
}
