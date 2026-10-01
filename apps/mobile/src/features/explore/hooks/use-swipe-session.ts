/**
 * A trip's swipe session on this phone: the session row with its deck, the places behind the
 * cards, everyone's yes votes and the matches from the synced trip rows, who is swiping right now
 * from the session's presence channel, and what this phone has swiped (kept on the device, since
 * a "no" is never synced back). Swipes queue offline; a match they make shows when it syncs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and storage keys, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { useCommand } from '@/data/commands/use-command';
import { usePresence } from '@/data/realtime/use-presence';

import {
  endSwipeSessionCommand,
  startSwipeSessionCommand,
  swipeVoteCommand,
  undoSwipeCommand,
} from '../commands';
import { useLiveRows } from '../data/live-rows';
import { useMyUid } from '../queries';
import {
  lastSwiped,
  parseDeck,
  withoutSwipe,
  withSwipe,
  type MatchRow,
  type Swiped,
  type Verdict,
  type YesVote,
} from '../swipe-model';

// createMMKV() is in-memory under Jest.
const storage = createMMKV({ id: 'cp-explore-swipes' });

function readSwiped(sessionId: string): Swiped {
  try {
    const parsed: unknown = JSON.parse(storage.getString(sessionId) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Swiped) : {};
  } catch {
    return {};
  }
}

const SESSION_SQL = `SELECT s.id, s.status, s.deck, s.started_by, s.match_rule,
    t.tz, t.start_date, t.end_date, d.name AS destination_name,
    (SELECT g.slug FROM guides g WHERE g.id = t.guide_id) AS guide_slug
  FROM swipe_sessions s JOIN trips t ON t.id = s.trip_id
    LEFT JOIN destinations d ON d.id = s.destination_id
  WHERE s.trip_id = ? AND (s.id = ? OR (? = 'new' AND s.status <> 'ended'))
  ORDER BY s.created_at DESC LIMIT 1`;
const SESSION_TABLES = ['swipe_sessions', 'trips', 'destinations', 'guides'];

const YES_SQL = 'SELECT poi_id, user_id FROM swipe_yes_votes WHERE session_id = ?';
const MATCH_SQL = `SELECT id, poi_id, day_no FROM swipe_matches WHERE session_id = ?
  ORDER BY created_at, id`;
const PLACES_SQL = `SELECT id, name, category, price_level FROM pois
  WHERE id IN (SELECT value FROM json_each(?))`;

export interface SessionRow {
  readonly id: string;
  readonly status: string;
  readonly deck: string | null;
  readonly started_by: string | null;
  readonly match_rule: number | null;
  readonly tz: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly destination_name: string | null;
  readonly guide_slug: string | null;
}

export interface DeckPlace {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly price_level: number | null;
}

export function useSwipeSession(tripId: string, sessionRef: string) {
  const me = useMyUid();
  const session = useLiveRows<SessionRow>(
    SESSION_SQL,
    [tripId, sessionRef, sessionRef],
    SESSION_TABLES,
  );
  const row = session.rows[0] ?? null;
  const sessionId = row?.id ?? null;
  const deck = useMemo(() => parseDeck(row?.deck), [row?.deck]);
  const ids = useMemo(() => JSON.stringify(deck.map((card) => card.poi_id)), [deck]);
  const places = useLiveRows<DeckPlace>(PLACES_SQL, [ids], ['pois']).rows;
  const yes = useLiveRows<{ poi_id: string; user_id: string }>(
    YES_SQL,
    sessionId === null ? null : [sessionId],
    ['swipe_yes_votes'],
  ).rows;
  const matchRows = useLiveRows<{ id: string; poi_id: string; day_no: number | null }>(
    MATCH_SQL,
    sessionId === null ? null : [sessionId],
    ['swipe_matches'],
  ).rows;
  const live = usePresence('swipe', sessionId);

  const start = useCommand(startSwipeSessionCommand);
  const vote = useCommand(swipeVoteCommand);
  const undo = useCommand(undoSwipeCommand);
  const end = useCommand(endSwipeSessionCommand);

  // No open session for the trip yet: opening the page starts one (a second start joins it).
  const started = useRef(false);
  const startSend = start.send;
  useEffect(() => {
    if (sessionRef !== 'new' || !session.loaded || row !== null || started.current) return;
    started.current = true;
    void startSend({ session_id: generateUuidV7(), trip_id: tripId });
  }, [row, session.loaded, sessionRef, startSend, tripId]);

  const [swiped, setSwiped] = useState<{ readonly id: string | null; readonly map: Swiped }>({
    id: null,
    map: {},
  });
  if (swiped.id !== sessionId) {
    setSwiped({ id: sessionId, map: sessionId === null ? {} : readSwiped(sessionId) });
  }
  const keep = useCallback(
    (next: Swiped) => {
      if (sessionId === null) return;
      storage.set(sessionId, JSON.stringify(next));
      setSwiped({ id: sessionId, map: next });
    },
    [sessionId],
  );

  const voteSend = vote.send;
  const undoSend = undo.send;
  const endSend = end.send;
  const swipe = useCallback(
    (poiId: string, verdict: Verdict) => {
      if (sessionId === null) return;
      keep(withSwipe(swiped.map, poiId, verdict));
      void voteSend({ session_id: sessionId, place_id: poiId, verdict });
    },
    [keep, sessionId, swiped.map, voteSend],
  );
  const undoLast = useCallback(() => {
    const last = lastSwiped(swiped.map);
    if (sessionId === null || last === null) return;
    keep(withoutSwipe(swiped.map, last));
    void undoSend({ session_id: sessionId, place_id: last });
  }, [keep, sessionId, swiped.map, undoSend]);
  const endSession = useCallback(() => {
    if (sessionId !== null) void endSend({ session_id: sessionId });
  }, [endSend, sessionId]);

  return {
    me,
    row,
    loaded: session.loaded,
    deck,
    places: useMemo(() => new Map(places.map((place) => [place.id, place])), [places]),
    yesVotes: useMemo(
      (): YesVote[] => yes.map((entry) => ({ poiId: entry.poi_id, userId: entry.user_id })),
      [yes],
    ),
    matches: useMemo(
      (): MatchRow[] =>
        matchRows.map((entry) => ({ id: entry.id, poiId: entry.poi_id, dayNo: entry.day_no })),
      [matchRows],
    ),
    live,
    swiped: swiped.map,
    canUndo: lastSwiped(swiped.map) !== null,
    swipe,
    undoLast,
    endSession,
  };
}
