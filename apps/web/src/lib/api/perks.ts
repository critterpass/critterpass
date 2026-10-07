/* eslint-disable lingui/no-unlocalized-strings -- header names and URL paths, not UI copy. */
/**
 * The api's perk catalogue (`GET /v1/catalog/perks`) for the pricing section. The list is the same
 * for every visitor and changes only when a perk is switched on or off, so one answer is kept per
 * Worker instance for a few minutes; when the api cannot be reached the last answer is used, and
 * with none the section is left out. It never holds a page up for long.
 */
import { publicPerksSchema, type PublicPerk } from '@cp/domain';

export interface PerksRequest {
  readonly apiBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export const PERKS_FRESH_MS = 5 * 60_000;

const kept = new Map<string, { readonly at: number; readonly perks: readonly PublicPerk[] }>();

/** The switched-on perks in display order, or null when none could be read. */
export async function fetchPublicPerks(
  request: PerksRequest,
): Promise<readonly PublicPerk[] | null> {
  const now = (request.now ?? Date.now)();
  const last = kept.get(request.apiBaseUrl);
  if (last !== undefined && now - last.at < PERKS_FRESH_MS) return last.perks;
  try {
    const response = await (request.fetchImpl ?? fetch)(`${request.apiBaseUrl}/v1/catalog/perks`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(request.timeoutMs ?? 1500),
    });
    if (!response.ok) return last?.perks ?? null;
    const parsed = publicPerksSchema.safeParse(await response.json());
    if (!parsed.success) return last?.perks ?? null;
    kept.set(request.apiBaseUrl, { at: now, perks: parsed.data.perks });
    return parsed.data.perks;
  } catch {
    return last?.perks ?? null;
  }
}
