/**
 * Home's offline line for a trip in the phone's offline window (under way, or starting within two
 * days): ready once the first sync is done and every stop's place card and every saved day's files
 * are on the phone, else the first thing still on its way, in the order a traveller needs it
 * (places, today's files, tickets, phrases, the map). A file the phone had no room for is said as
 * such, since it will not arrive by waiting. Days the server has not built yet (it builds each one
 * the evening before) are not owed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- kinds and dates, never copy. */
import type { BundleAssetKind } from '@cp/domain';

import { END_GRACE_DAYS, OFFLINE_LEAD_DAYS } from '@/data/powersync/offline-trip-holds';
import type { SavedDay } from '@/features/trip/bundle/bundle-manager';

export type OfflineWhat = 'places' | 'today' | 'tickets' | 'phrases' | 'map';

export type OfflineLine =
  | { readonly kind: 'ready' }
  | { readonly kind: 'downloading'; readonly what: OfflineWhat }
  | { readonly kind: 'no_space'; readonly what: Exclude<OfflineWhat, 'places' | 'today'> };

const FILE_WHAT: Record<BundleAssetKind, 'tickets' | 'phrases' | 'map'> = {
  attachment: 'tickets',
  phrase_audio: 'phrases',
  map_region: 'map',
};
const ORDER: readonly BundleAssetKind[] = ['attachment', 'phrase_audio', 'map_region'];

const dayIndex = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export interface OfflineReadinessInput {
  /** Today on the trip's clock, `YYYY-MM-DD`. */
  readonly today: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Stops of the trip's plan whose place card is not on the phone yet. */
  readonly missingPlaces: number;
  /** False until the phone's first full sync, before which the plan itself may not be here. */
  readonly synced: boolean;
  readonly days: readonly Pick<SavedDay, 'localDate' | 'missing'>[];
}

/** Null outside the offline window, where the phone does not keep the trip. */
export function offlineLineFor(input: OfflineReadinessInput): OfflineLine | null {
  const { today, startDate, missingPlaces } = input;
  if (startDate === null) return null;
  const endDate = input.endDate ?? startDate;
  const now = dayIndex(today);
  if (dayIndex(startDate) - now > OFFLINE_LEAD_DAYS) return null;
  if (dayIndex(endDate) < now - END_GRACE_DAYS) return null;
  if (!input.synced || missingPlaces > 0) return { kind: 'downloading', what: 'places' };
  const ahead = input.days.filter((day) => day.localDate >= today);
  const underWay = startDate <= today && today <= endDate;
  if (underWay && !ahead.some((day) => day.localDate === today)) {
    return { kind: 'downloading', what: 'today' };
  }
  const missing = ahead.flatMap((day) => day.missing);
  for (const reason of ['failed', 'space'] as const) {
    const kind = ORDER.find((k) => missing.some((m) => m.kind === k && m.reason === reason));
    if (kind === undefined) continue;
    return reason === 'failed'
      ? { kind: 'downloading', what: FILE_WHAT[kind] }
      : { kind: 'no_space', what: FILE_WHAT[kind] };
  }
  return { kind: 'ready' };
}
