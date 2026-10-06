/**
 * The idea board's reads: the public board through the api (its last good copy offline), the
 * traveller's own votes and ideas under review from the phone, and the crewmates who voted for
 * each idea, named from the crew the phone already holds.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route paths, never copy. */
import { useEffect, useMemo, useState } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { useTravelRead } from '@/data/travel-data/use-travel-read';

import { useLiveRows } from '../data/live-rows';
import type { BoardIdea, MyVote } from './board';
import { BOARD_PATH, boardParser, fetchCrewmateVotes, type CrewmateVote } from './ideas-api';

const MY_VOTES_SQL = 'SELECT idea_id, month_key FROM idea_votes';
const MY_PENDING_SQL = `SELECT id, title, description, status, team_note, votes_count,
  status_changed_at, created_at FROM ideas WHERE status = 'pending_review'`;
const NAMES_SQL = `SELECT id, display_name FROM users
  WHERE id IN (SELECT value FROM json_each(?))`;

export interface Board {
  readonly ideas: readonly BoardIdea[];
  /** False while the first answer is on its way; then the board (or the offline copy) shows. */
  readonly loaded: boolean;
  /** No answer and no copy: the board cannot be shown yet. */
  readonly unavailable: boolean;
  readonly myVotes: readonly MyVote[];
  readonly myPending: readonly BoardIdea[];
  /** Crewmates' first names per idea. */
  readonly faces: ReadonlyMap<string, readonly string[]>;
}

const ALWAYS_OK = () => ({ status: 'ok', seenAt: null }) as const;

function useCrewmateVotes(): readonly CrewmateVote[] {
  const [votes, setVotes] = useState<readonly CrewmateVote[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchCrewmateVotes(controller.signal).then(
      (found) => {
        if (!controller.signal.aborted) setVotes(found);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, []);
  return votes;
}

export function useBoard(): Board {
  const read = useTravelRead({ path: BOARD_PATH, schema: boardParser, classify: ALWAYS_OK });
  const myVotes = useLiveRows<MyVote>(MY_VOTES_SQL, [], ['idea_votes']).rows;
  const myPending = useLiveRows<BoardIdea>(MY_PENDING_SQL, [], ['ideas']).rows;
  const crewmates = useCrewmateVotes();
  const ids = JSON.stringify([...new Set(crewmates.map((vote) => vote.user_id))].sort());
  const names = useLiveRows<{ id: string; display_name: string | null }>(
    NAMES_SQL,
    [ids],
    ['users'],
  ).rows;
  const faces = useMemo(() => {
    const byId = new Map(names.map((row) => [row.id, row.display_name?.trim() ?? '']));
    const out = new Map<string, string[]>();
    for (const vote of crewmates) {
      const name = byId.get(vote.user_id);
      if (name === undefined || name === '') continue;
      out.set(vote.idea_id, [...(out.get(vote.idea_id) ?? []), name.split(/\s+/u)[0] ?? name]);
    }
    return out;
  }, [crewmates, names]);
  const ideas = dataOf(read)?.ideas;
  return {
    ideas: ideas ?? [],
    loaded: read.status !== 'loading',
    unavailable: read.status === 'missing',
    myVotes,
    myPending,
    faces,
  };
}
