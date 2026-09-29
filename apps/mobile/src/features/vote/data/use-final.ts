/**
 * What the final and the winner reveal read beside the poll: each finalist's pitch (the guide's
 * line and the tool chips, synced on the crew's pitches), the organiser's name, the tie sentence's
 * origin city, and the reveal still waiting for this user.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { airportDataset } from '@cp/content/airports';
import { homeBaseFor, pitchSectionsSchema, type PitchSections } from '@cp/domain';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { voteRoutes } from '../routes';

import { useLiveRows } from './live-rows';
import { PENDING_REVEAL_SQL, REVEAL_TABLES } from './poll-queries';
import type { PollView } from './poll-view';

const PITCHES_SQL = `SELECT id, sections FROM pitches
  WHERE id IN (SELECT pitch_id FROM poll_options WHERE poll_id = ? AND pitch_id IS NOT NULL)`;
const PITCH_TABLES = ['pitches', 'poll_options'];

const ORGANISER_NAME_SQL = `SELECT u.display_name FROM trip_participants p JOIN users u ON u.id = p.user_id
  WHERE p.trip_id = ? AND p.role = 'organiser' ORDER BY p.created_at LIMIT 1`;
const ORGANISER_TABLES = ['trip_participants', 'users'];

/** Pitch sections by pitch id. */
export function usePitchSections(pollId: string | null): ReadonlyMap<string, PitchSections> {
  const { rows } = useLiveRows<{ id: string; sections: string | null }>(
    PITCHES_SQL,
    pollId === null ? null : [pollId],
    PITCH_TABLES,
  );
  return useMemo(() => {
    const map = new Map<string, PitchSections>();
    for (const row of rows) {
      try {
        const parsed = pitchSectionsSchema.safeParse(JSON.parse(row.sections ?? '{}'));
        if (parsed.success) map.set(row.id, parsed.data);
      } catch {
        // A pitch that never finished streaming has no sections to show.
      }
    }
    return map;
  }, [rows]);
}

export function useOrganiserName(poll: PollView | null): string | null {
  const { rows } = useLiveRows<{ display_name: string | null }>(
    ORGANISER_NAME_SQL,
    poll?.tripId == null ? null : [poll.tripId],
    ORGANISER_TABLES,
  );
  const name = rows[0]?.display_name ?? null;
  return name === null ? null : (name.split(' ')[0] ?? name);
}

/** "Singapore" for SIN, else the code itself. */
export function originCity(iata: string): string {
  return homeBaseFor(airportDataset(), iata)?.city ?? iata;
}

/** The newest closed destination poll whose reveal this user has not seen yet. */
export function usePendingReveal(me: string | null): string | null {
  const { rows } = useLiveRows<{ poll_id: string }>(
    PENDING_REVEAL_SQL,
    me === null ? null : [me],
    REVEAL_TABLES,
  );
  return rows[0]?.poll_id ?? null;
}

/** Reveals already opened in this app session, so a slow `mark_reveal_seen` never shows one twice. */
const opened = new Set<string>();

/**
 * The reveal-once gate: while Home is on screen, a closed destination poll this user has not seen
 * opens its reveal. The synced `poll_reveals` row (marked seen from any device) keeps it to once.
 */
export function useRevealOnOpen(me: string | null): void {
  const pending = usePendingReveal(me);
  const focused = useIsFocused();
  useEffect(() => {
    if (pending === null || !focused || opened.has(pending)) return;
    opened.add(pending);
    router.push(voteRoutes.reveal(pending));
  }, [pending, focused]);
}
