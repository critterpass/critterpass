/* eslint-disable lingui/no-unlocalized-strings -- URL paths and header names, not UI copy. */
/**
 * The api's public link switches (`GET /v1/links/settings`), read by the association file and the
 * handoff pages. Cached per Worker isolate for as long as the api allows (60 s), and off whenever
 * the api is slow or unreachable: a missing answer must never switch the App Clip on.
 */
import { linkSettingsSchema } from '@cp/domain';

export interface LinkSwitches {
  readonly appClip: boolean;
}

export const LINK_SWITCHES_OFF: LinkSwitches = { appClip: false };
export const LINK_SETTINGS_TTL_MS = 60_000;

interface CacheEntry {
  readonly switches: LinkSwitches;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface LinkSettingsRequest {
  readonly apiBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export async function fetchLinkSwitches(request: LinkSettingsRequest): Promise<LinkSwitches> {
  const now = (request.now ?? Date.now)();
  const cached = cache.get(request.apiBaseUrl);
  if (cached !== undefined && cached.expiresAt > now) return cached.switches;
  let switches = LINK_SWITCHES_OFF;
  try {
    const response = await (request.fetchImpl ?? fetch)(`${request.apiBaseUrl}/v1/links/settings`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(request.timeoutMs ?? 1500),
    });
    if (response.ok) {
      const parsed = linkSettingsSchema.safeParse(await response.json());
      if (parsed.success) switches = { appClip: parsed.data.app_clip };
    }
  } catch {
    switches = LINK_SWITCHES_OFF;
  }
  cache.set(request.apiBaseUrl, { switches, expiresAt: now + LINK_SETTINGS_TTL_MS });
  return switches;
}

export function clearLinkSwitchesCache(): void {
  cache.clear();
}
