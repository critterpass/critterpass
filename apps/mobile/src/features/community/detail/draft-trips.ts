/** This person's trips still being planned, for choosing which trip a shared plan goes into. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows } from '@/data/powersync/live-rows';
import { useSessionUid } from '@/data/powersync/use-session-uid';

import type { TakeTarget } from './use-take-plan';

/** Trips whose plan is still open, the plan's own destination first, then the newest. */
const DRAFT_TRIPS_SQL = `
  SELECT t.id, d.name AS destination, p.role
    FROM trips t
    JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
    LEFT JOIN destinations d ON d.id = t.destination_id
   WHERE t.status IN ('setup', 'drafting', 'draft_review', 'redrafting', 'proposed')
   ORDER BY (t.destination_id = ?) DESC, t.id DESC
   LIMIT 8`;
const DRAFT_TRIPS_TABLES = ['trips', 'trip_participants', 'destinations'];

export interface DraftTripRow {
  readonly id: string;
  readonly destination: string | null;
  readonly role: string | null;
}

/** This person's trips still being planned, the plan's own destination first. */
export function useDraftTrips(destinationId: string): readonly DraftTripRow[] {
  const uid = useSessionUid();
  return useLiveRows<DraftTripRow>(
    DRAFT_TRIPS_SQL,
    uid === null ? null : [uid, destinationId],
    DRAFT_TRIPS_TABLES,
  ).rows;
}

export interface TripPickerProps {
  readonly destinationId: string;
  readonly destinationName: string;
  readonly onPick: (target: TakeTarget) => void;
  readonly onStart: () => void;
  readonly onClose: () => void;
}
