/**
 * The year-later memory's rows from the local database (they ride the trip's stream, kept for
 * travellers who left the crew): the memory, the trip's place and guide, the recap's stats for the
 * moment it calls back, the crew's reactions with names and colours, whether the viewer is still in
 * the crew (only they can pitch a reunion), and the stamp's signatures for the shared image.
 * Reactions also arrive live on `memory:{id}` ahead of their rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { memoryReactionDataSchema, RECAP_RT, type RecapStats } from '@cp/domain';
import { useMemo, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { useActiveLocale } from '@/lib/i18n/use-locale';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { readRecap, type RecapRow } from '../data/recap-rows';
import { RECAP_SQL, TRIP_SQL, type TripRow } from '../data/use-recap-summary';
import type { LiveReaction, MemoryReactionRow } from './memory-model';

export interface MemoryRow {
  readonly id: string;
  readonly trip_id: string;
  readonly text: string;
  readonly local_date: string | null;
  readonly photo_media_key: string | null;
}

export interface MemorySigner {
  readonly userId: string;
  readonly name: string;
  readonly colour: string | null;
  readonly strokeKey: string | null;
}

export interface MemoryData {
  readonly loaded: boolean;
  readonly viewerId: string | null;
  readonly memory: MemoryRow | null;
  readonly trip: TripRow | null;
  readonly stats: RecapStats | null;
  readonly reactions: readonly MemoryReactionRow[];
  readonly live: readonly LiveReaction[];
  readonly inCrew: boolean;
  readonly signers: readonly MemorySigner[];
}

const MEMORY_SQL = `
  SELECT id, trip_id, text, local_date, photo_media_key FROM memories WHERE id = ?`;
const REACTIONS_SQL = `
  SELECT r.user_id, r.emoji, r.text, u.display_name AS name, m.colour
    FROM memory_reactions r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN trips t ON t.id = r.trip_id
    LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = r.user_id
   WHERE r.memory_id = ?
   ORDER BY r.created_at, r.user_id`;
const IN_CREW_SQL = `
  SELECT 1 AS yes FROM crew_members m JOIN trips t ON t.crew_id = m.crew_id
   WHERE t.id = ? AND m.user_id = ? LIMIT 1`;
// Each signer once, in the order they signed (every traveller's stamp holds the same names).
const SIGNERS_SQL = `
  SELECT s.signer_id AS user_id, min(s.stroke_media_key) AS stroke_media_key,
         coalesce(u.display_name, '') AS name, m.colour, min(s.signed_at) AS signed_at
    FROM stamp_signatures s
    LEFT JOIN users u ON u.id = s.signer_id
    LEFT JOIN trips t ON t.id = s.trip_id
    LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = s.signer_id
   WHERE s.trip_id = ?
   GROUP BY s.signer_id
   ORDER BY signed_at, s.signer_id`;

function useLiveReactions(memoryId: string): readonly LiveReaction[] {
  const [live, setLive] = useState<readonly LiveReaction[]>([]);
  useChannel('memory', memoryId, {
    onEvent: (envelope) => {
      if (envelope.type !== RECAP_RT.reaction) return;
      const data = memoryReactionDataSchema.safeParse(envelope.data);
      if (!data.success) return;
      const next = { userId: data.data.user_id, emoji: data.data.emoji, text: data.data.text };
      setLive((all) => [...all.filter((r) => r.userId !== next.userId), next]);
    },
  });
  return live;
}

export function useMemory(memoryId: string, tripId: string): MemoryData {
  const me = useOwnerUid();
  const locale = useActiveLocale();
  const memory = useLiveRows<MemoryRow>(MEMORY_SQL, [memoryId], ['memories']);
  const trip = useLiveRows<TripRow>(
    TRIP_SQL,
    [tripId],
    ['trips', 'crews', 'destinations', 'guides'],
  );
  const recap = useLiveRows<RecapRow>(RECAP_SQL, [tripId], ['recaps']);
  const reactions = useLiveRows<MemoryReactionRow>(
    REACTIONS_SQL,
    [memoryId],
    ['memory_reactions', 'users', 'crew_members'],
  );
  const inCrew = useLiveRows<{ yes: number }>(IN_CREW_SQL, me === null ? null : [tripId, me], [
    'crew_members',
    'trips',
  ]);
  const signers = useLiveRows<{
    user_id: string;
    stroke_media_key: string | null;
    name: string;
    colour: string | null;
  }>(SIGNERS_SQL, [tripId], ['stamp_signatures', 'users', 'crew_members']);
  const live = useLiveReactions(memoryId);
  const recapRow = recap.rows[0] ?? null;
  const stats = useMemo(
    () => (recapRow === null ? null : readRecap(recapRow, locale).stats),
    [recapRow, locale],
  );

  return {
    loaded: memory.loaded && trip.loaded && reactions.loaded,
    viewerId: me,
    memory: memory.rows[0] ?? null,
    trip: trip.rows[0] ?? null,
    stats,
    reactions: reactions.rows,
    live,
    inCrew: inCrew.rows.length > 0,
    signers: signers.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      colour: row.colour,
      strokeKey: row.stroke_media_key,
    })),
  };
}
