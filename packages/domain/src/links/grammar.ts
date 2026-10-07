/**
 * The link grammar every side shares (web handoff pages, the api resolver and claim validator, the
 * app's deep-link router): one route table, `parseLink` and `buildLink`.
 *
 * | Path | Kind | Params |
 * |---|---|---|
 * | `/i/{code}[/{seat}]` | invite (crew, trip or referral code; optional seat token) | code, seat? |
 * | `/j/{code}[/{seat}]` | invite (alias of `/i/`, parsed identically, never built) | code, seat? |
 * | `/p/{token}` | plan_share (shared read-only plan) | token |
 * | `/r/{code}` | referral | code |
 * | `/rc/{token}` | recap_share (a trip recap's public page) | token |
 * | `/plan/{id}` | plan (member plan deep link, trip id) | id |
 * | `/g/{slug}` | guide | slug |
 * | `/locals/{slug}` | locals | slug |
 * | `/app/{path}` | app (generic in-app route) | path |
 *
 * Optional query `c` carries the share channel (`?c=wa`), used for "Opened from WhatsApp".
 */
import { normalizeJoinCode } from './codes';
import { ALL_LINK_HOSTS } from './hosts';
import { isSeatTokenShape } from './seat-token';

export const LINK_KINDS = [
  'invite',
  'plan_share',
  'referral',
  'plan',
  'guide',
  'locals',
  'app',
  'recap_share',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_CHANNELS = ['wa', 'imsg', 'sms', 'ig', 'tg', 'mail', 'qr', 'copy', 'x'] as const;
export type LinkChannel = (typeof LINK_CHANNELS)[number];

export type LinkTarget =
  | { readonly kind: 'invite'; readonly code: string; readonly seat?: string }
  | { readonly kind: 'plan_share'; readonly token: string }
  | { readonly kind: 'referral'; readonly code: string }
  | { readonly kind: 'plan'; readonly id: string }
  | { readonly kind: 'guide'; readonly slug: string }
  | { readonly kind: 'locals'; readonly slug: string }
  | { readonly kind: 'app'; readonly path: string }
  | { readonly kind: 'recap_share'; readonly token: string };

export interface ParsedLink {
  readonly target: LinkTarget;
  /** Lower-cased host the link was opened on; null for a bare path. */
  readonly host: string | null;
  readonly channel: LinkChannel | null;
}

/** First path segment of each kind, as built. `/j/` is accepted by the parser only. */
export const LINK_PATH_PREFIXES: Readonly<Record<LinkKind, string>> = {
  invite: 'i',
  plan_share: 'p',
  referral: 'r',
  plan: 'plan',
  guide: 'g',
  locals: 'locals',
  app: 'app',
  recap_share: 'rc',
};

/**
 * Every first path segment both platforms claim natively (Universal Links / App Links); the
 * Android manifest lists exactly these.
 */
export const APP_LINK_PATH_PREFIXES: readonly string[] = [
  'i',
  'j',
  'p',
  'r',
  'plan',
  'g',
  'locals',
  'app',
];

/**
 * Link paths claimed through the web's association file alone: iOS opens them in the app as soon as
 * the file is served, Android shows their web page, whose button opens the app through an `/app/`
 * path, until its manifest lists them too.
 */
export const ASSOCIATION_ONLY_PATH_PREFIXES: readonly string[] = ['rc'];

/** Every first path segment the link grammar reads, as a custom-scheme URL may carry it. */
export const LINK_GRAMMAR_PATH_PREFIXES: readonly string[] = [
  ...APP_LINK_PATH_PREFIXES,
  ...ASSOCIATION_ONLY_PATH_PREFIXES,
];

/** Paths on the link hosts that always stay in the browser. */
export const APP_LINK_EXCLUDED_PATHS: readonly string[] = [
  '/',
  '/tips*',
  '/legal*',
  '/help*',
  '/account*',
  '/t/*',
];

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 64;
const APP_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const APP_MAX_SEGMENTS = 8;

function isSlug(value: string): boolean {
  return value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function inviteFromSegments(rest: readonly string[]): LinkTarget | null {
  if (rest.length < 1 || rest.length > 2) return null;
  const code = normalizeJoinCode(rest[0] ?? '');
  if (code === null) return null;
  const seat = rest[1];
  if (seat === undefined) return { kind: 'invite', code };
  return isSeatTokenShape(seat) ? { kind: 'invite', code, seat } : null;
}

function single(rest: readonly string[]): string | null {
  return rest.length === 1 ? (rest[0] ?? null) : null;
}

/** Parses a link path (`/i/ABC234`, trailing slash allowed) into its target, or null. */
export function parseLinkPath(pathname: string): LinkTarget | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const decoded = segments.map(decodeSegment);
  if (decoded.some((segment) => segment === null)) return null;
  const [prefix, ...rest] = decoded as string[];
  if (prefix === undefined) return null;

  switch (prefix) {
    case 'i':
    case 'j':
      return inviteFromSegments(rest);
    case 'p': {
      const token = single(rest);
      return token !== null && SHARE_TOKEN_PATTERN.test(token)
        ? { kind: 'plan_share', token }
        : null;
    }
    case 'rc': {
      const token = single(rest);
      return token !== null && SHARE_TOKEN_PATTERN.test(token)
        ? { kind: 'recap_share', token }
        : null;
    }
    case 'r': {
      const code = normalizeJoinCode(single(rest) ?? '');
      return code === null ? null : { kind: 'referral', code };
    }
    case 'plan': {
      const id = single(rest)?.toLowerCase() ?? null;
      return id !== null && UUID_PATTERN.test(id) ? { kind: 'plan', id } : null;
    }
    case 'g':
    case 'locals': {
      const slug = single(rest);
      if (slug === null || !isSlug(slug)) return null;
      return prefix === 'g' ? { kind: 'guide', slug } : { kind: 'locals', slug };
    }
    case 'app': {
      if (rest.length < 1 || rest.length > APP_MAX_SEGMENTS) return null;
      if (!rest.every((segment) => APP_SEGMENT_PATTERN.test(segment))) return null;
      return { kind: 'app', path: rest.join('/') };
    }
    default:
      return null;
  }
}

function parseChannel(value: string | null): LinkChannel | null {
  return value !== null && (LINK_CHANNELS as readonly string[]).includes(value)
    ? (value as LinkChannel)
    : null;
}

export interface ParseLinkOptions {
  /** Hosts accepted for absolute URLs; defaults to every environment's link hosts. */
  readonly hosts?: readonly string[];
}

/**
 * Parses an absolute `https://` link on a link host, or a bare path. Anything else (other hosts,
 * other schemes, unknown paths, malformed params) is null; custom-scheme URLs go through
 * `parseSchemeUrl`.
 */
export function parseLink(input: string, options: ParseLinkOptions = {}): ParsedLink | null {
  const trimmed = input.trim();
  if (trimmed.startsWith('/')) {
    const url = new URL(trimmed, 'https://link.invalid');
    const target = parseLinkPath(url.pathname);
    return target === null
      ? null
      : { target, host: null, channel: parseChannel(url.searchParams.get('c')) };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!(options.hosts ?? ALL_LINK_HOSTS).includes(host)) return null;
  const target = parseLinkPath(url.pathname);
  if (target === null) return null;
  return { target, host, channel: parseChannel(url.searchParams.get('c')) };
}

/** Path of a target, e.g. `/i/ABC234/<seat>`; the canonical form `parseLinkPath` reads back. */
export function linkPath(target: LinkTarget): string {
  const prefix = LINK_PATH_PREFIXES[target.kind];
  switch (target.kind) {
    case 'invite':
      return target.seat === undefined
        ? `/${prefix}/${target.code}`
        : `/${prefix}/${target.code}/${target.seat}`;
    case 'plan_share':
    case 'recap_share':
      return `/${prefix}/${target.token}`;
    case 'referral':
      return `/${prefix}/${target.code}`;
    case 'plan':
      return `/${prefix}/${target.id}`;
    case 'guide':
    case 'locals':
      return `/${prefix}/${target.slug}`;
    case 'app':
      return `/${prefix}/${target.path}`;
  }
}

export interface BuildLinkOptions {
  readonly host: string;
  readonly channel?: LinkChannel;
}

export function buildLink(target: LinkTarget, options: BuildLinkOptions): string {
  const query = options.channel === undefined ? '' : `?c=${options.channel}`;
  return `https://${options.host.toLowerCase()}${linkPath(target)}${query}`;
}
