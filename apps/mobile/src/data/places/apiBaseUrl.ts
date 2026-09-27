/**
 * The real api service's base URL, shared by `usePlaceSearch.ts` and `useRegionPack.ts`.
 * `EXPO_PUBLIC_*` env vars are inlined by Metro/Expo at build time (no `app.config.ts` change
 * needed); the default is the real staging Railway domain (verified live: `railway service api`
 * then `railway domain`), used until a custom domain is attached for the api service the way
 * `infra/cloudflare/tiles/wrangler.toml` documents for tiles.
 */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a URL, never rendered as copy.
const DEFAULT_API_BASE_URL = 'https://api-staging-de92.up.railway.app';

export function resolveApiBaseUrl(): string {
  // React Native's ambient ProcessEnv typing makes bracket access resolve to `any`; assert the
  // real (Metro-inlined) type explicitly rather than letting `any` flow into `fromEnv`.
  const fromEnv = process.env['EXPO_PUBLIC_API_BASE_URL'];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : DEFAULT_API_BASE_URL;
}
