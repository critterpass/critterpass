/**
 * Sponsored picks, apart from any rendering: a list shows what the server placed, but never more
 * than one sponsored card and never one in first place, and each placement's impression is
 * counted once per time the list is shown.
 */
import type { PicksEntryWire } from '@cp/domain';

export type ListKind = 'picks' | 'map_carousel' | 'search';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a wire value, never copy.
export const MAP_CAROUSEL: ListKind = 'map_carousel';

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

/** The server's list as cards: organic order untouched, one sponsored card at most, never first. */
export function pickEntries(entries: readonly PicksEntryWire[]): PickEntry[] {
  const cards: PickEntry[] = [];
  let sponsored = false;
  for (const entry of entries) {
    if (entry.kind === 'organic') {
      cards.push({
        poiId: entry.item.poi_id,
        name: entry.item.name,
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
