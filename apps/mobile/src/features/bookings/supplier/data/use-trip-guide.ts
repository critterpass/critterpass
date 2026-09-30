/** The trip's guide (slug and name) for the disclosure line and guide notes. Tokek stands in as guest guide. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and guide ids, never copy. */
import type { GuideId } from '@/ui/people/GuideLine';

import { useLiveRows } from '../../data/live-rows';

const GUIDE_SQL = `SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = ?`;
const GUIDE_TABLES = ['trips', 'guides'];
const GUIDE_IDS: readonly string[] = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'chava'];

export interface TripGuide {
  readonly id: GuideId;
  readonly name: string;
}

export const GUEST_GUIDE: TripGuide = { id: 'tokek', name: 'Tokek' };

export function useTripGuide(tripId: string | null): TripGuide {
  const { rows } = useLiveRows<{ slug: string; name: string }>(
    GUIDE_SQL,
    tripId === null ? null : [tripId],
    GUIDE_TABLES,
  );
  const row = rows[0];
  if (row === undefined || !GUIDE_IDS.includes(row.slug)) return GUEST_GUIDE;
  return { id: row.slug as GuideId, name: row.name };
}
