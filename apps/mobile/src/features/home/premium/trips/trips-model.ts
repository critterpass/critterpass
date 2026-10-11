/**
 * The premium Trips list (3.05) from the caller's trips: the one under way leads as the live card,
 * the trips ahead are the "Coming up" grid, trips that are over are quiet rows at the foot, and
 * the filter narrows it to planning or home-again trips. Called-off trips stay out of the list.
 */
/* eslint-disable lingui/no-unlocalized-strings -- statuses and filter values, never copy. */
import type { TripStatus } from '@cp/domain';

export interface PremiumTripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly status: TripStatus;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly plan_progress: number | null;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
  readonly guide_slug: string | null;
}

export type TripsFilter = 'all' | 'planning' | 'home';

export interface TripsLists {
  readonly live: PremiumTripRow | null;
  readonly coming: readonly PremiumTripRow[];
  readonly past: readonly PremiumTripRow[];
  /** Every trip the list can show (the "All · n" count). */
  readonly total: number;
}

const PAST = new Set(['post_trip', 'archived']);

export function splitTrips(rows: readonly PremiumTripRow[], filter: TripsFilter): TripsLists {
  const shown = rows.filter((row) => row.status !== 'cancelled');
  const live = shown.find((row) => row.status === 'in_trip') ?? null;
  const coming = shown.filter((row) => row !== live && !PAST.has(row.status));
  const past = shown.filter((row) => PAST.has(row.status));
  if (filter === 'planning') return { live: null, coming, past: [], total: shown.length };
  if (filter === 'home') return { live: null, coming: [], past, total: shown.length };
  return { live, coming, past, total: shown.length };
}

/** "2 of 4"-style progress word for a trip ahead: planning until a plan exists, else its percent. */
export function tripStage(row: PremiumTripRow): 'voting' | 'planning' | 'locked' {
  if (row.destination_name === null) return 'voting';
  if (row.status === 'confirmed' || row.status === 'pre_trip') return 'locked';
  return 'planning';
}
