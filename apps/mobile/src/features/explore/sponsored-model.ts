/**
 * Sponsored picks, apart from any rendering: a list shows what the server placed, but never more
 * than one sponsored card and never one in first place, and each placement's impression is
 * counted once per time the list is shown.
 */
import { shownName, type PicksEntryWire } from '@cp/domain';

export type ListKind = 'picks' | 'map_carousel' | 'search';

/** How many picks a row shows, and under how many of the server's the phone's own top it up. */
export const PICKS_SHOWN = 8;
const PICKS_TOP_UP_UNDER = 4;

export interface SponsoredSlot {
  readonly placementId: string;
  readonly partner: string;
}

export interface PickEntry {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  /** Set on the one labelled, paid-for card. */
  readonly sponsored: SponsoredSlot | null;
}

/**
 * The server's list as cards, in the order given, one sponsored card at most and never first.
 * Where the guide marks must-sees, only those are picks (the row is never padded out with the rest
 * of the curated set); a destination that runs on automatic picks marks none, so its picks are the
 * recommended places as ranked. With no organic place there is no row (and no sponsored card).
 */
export function pickEntries(
  entries: readonly PicksEntryWire[],
  /** The reader sees the destination's local names (`@cp/domain` `shownName`). */
  readsLocal = false,
): PickEntry[] {
  const marked = entries.some((entry) => entry.kind === 'organic' && entry.item.must_see);
  const cards: PickEntry[] = [];
  let sponsored = false;
  for (const entry of entries) {
    if (entry.kind === 'organic') {
      if (marked && !entry.item.must_see) continue;
      cards.push({
        poiId: entry.item.poi_id,
        name: shownName({ name: entry.item.name, nameLocal: entry.item.name_local }, readsLocal),
        category: entry.item.category,
        sponsored: null,
      });
    } else if (!sponsored && cards.length > 0) {
      sponsored = true;
      cards.push({
        poiId: entry.item.poi_id,
        name: entry.item.name,
        category: entry.item.category,
        sponsored: { placementId: entry.item.placement_id, partner: entry.item.partner },
      });
    }
  }
  return cards;
}

/**
 * The picks a page draws: the server's, and when it sent none (or could not be reached) the
 * recommended places this phone holds, `skip` left out (places already in the plan), `limit` kept.
 */
export function picksOrLocal(
  server: readonly PickEntry[],
  local: readonly Omit<PickEntry, 'sponsored'>[],
  options: { readonly skip?: ReadonlySet<string>; readonly limit?: number } = {},
): PickEntry[] {
  const skip = options.skip ?? new Set<string>();
  const kept = server.filter((pick) => !skip.has(pick.poiId));
  const organic = kept.filter((pick) => pick.sponsored === null);
  const limit = options.limit ?? PICKS_SHOWN;
  if (organic.length >= Math.min(limit, PICKS_TOP_UP_UNDER)) return kept;
  const seen = new Set(kept.map((pick) => pick.poiId));
  const more = local
    .filter((place) => !skip.has(place.poiId) && !seen.has(place.poiId))
    .slice(0, Math.max(0, limit - organic.length))
    .map((place) => ({ ...place, sponsored: null }));
  // A sponsored card never leads: with no organic card from the server it is dropped.
  return organic.length === 0 ? more : [...kept, ...more];
}

/** Puts a slot the app fetched itself into a list it built, third (or last in a shorter list). */
export function withSlot(
  organic: readonly PickEntry[],
  slot: (SponsoredSlot & Omit<PickEntry, 'sponsored'>) | null,
): PickEntry[] {
  if (slot === null || organic.length === 0) return [...organic];
  if (organic.some((entry) => entry.poiId === slot.poiId)) return [...organic];
  const at = Math.min(2, organic.length);
  const { placementId, partner, ...place } = slot;
  return [
    ...organic.slice(0, at),
    { ...place, sponsored: { placementId, partner } },
    ...organic.slice(at),
  ];
}

/** Says yes once per placement and list, so a re-render never counts a second impression. */
export function createImpressionGate(): (placementId: string, list: ListKind) => boolean {
  const seen = new Set<string>();
  return (placementId, list) => {
    const key = `${list}:${placementId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

/* eslint-disable lingui/no-unlocalized-strings -- brand names, never translated. */
const PARTNER_NAMES: Readonly<Record<string, string>> = {
  agoda: 'Agoda',
  trip_com: 'Trip.com',
  booking_cj: 'Booking.com',
  klook: 'Klook',
  gyg: 'GetYourGuide',
  viator: 'Viator',
};
/* eslint-enable lingui/no-unlocalized-strings */

/** A partner as it writes its own name; an unknown key is shown as it came. */
export function partnerName(key: string): string {
  return PARTNER_NAMES[key] ?? key;
}
