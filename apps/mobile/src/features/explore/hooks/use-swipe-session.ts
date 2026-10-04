/**
 * A trip's swipe session on this phone: the session row with its deck, the places behind the
 * cards, everyone's yes votes and the matches from the synced trip rows, who is swiping right now
 * from the session's presence channel, and what the signed-in person has swiped (kept on the device
 * per person, since a "no" is never synced back). Swipes queue offline; a match they make shows when it syncs. Each
 * match says where it went: the trip's Ideas (its idea, once synced) or an earlier change set.
 * With `saveYes` (the planning screens on), every yes also saves the place to the trip's Ideas under
 * the swiper's name at once, whoever else has swiped; undoing that yes takes them back out.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and storage keys, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { useCommand } from '@/data/commands/use-command';
import { textArray } from '@/data/ideas/use-trip-ideas';
import { usePresence } from '@/data/realtime/use-presence';

import {
  endSwipeSessionCommand,
  startSwipeSessionCommand,
  swipeVoteCommand,
  undoSwipeCommand,
} from '../commands';
import { useLiveRows } from '../data/live-rows';
import { removeIdeaCommand, saveIdeaCommand } from '../place-detail/commands';
import { useMyUid } from '../queries';
import {
  ideaToTakeBack,
  lastSwiped,
  parseDeck,
  withoutSwipe,
  withSwipe,
  yesSaves,
  type DeckIdea,
  type MatchRow,
  type Swiped,
  type Verdict,
  type YesVote,
} from '../swipe-model';

// createMMKV() is in-memory under Jest.
const storage = createMMKV({ id: 'cp-explore-swipes' });

/** What one person has swiped in one session: two people sharing a phone each get the whole deck. */
export function swipedKey(uid: string | null, sessionId: string | null): string | null {
  return uid === null || sessionId === null ? null : `${uid}:${sessionId}`;
}

function readSwiped(key: string): Swiped {
  try {
    const parsed: unknown = JSON.parse(storage.getString(key) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Swiped) : {};
  } catch {
    return {};
  }
}

const SESSION_SQL = `SELECT s.id, s.status, s.deck, s.started_by, s.match_rule,
    coalesce(t.tz, d.tz) AS tz, t.start_date, t.end_date, d.name AS destination_name,
    (SELECT g.slug FROM guides g WHERE g.id = t.guide_id) AS guide_slug
  FROM swipe_sessions s JOIN trips t ON t.id = s.trip_id
    LEFT JOIN destinations d ON d.id = s.destination_id
  WHERE s.trip_id = ? AND (s.id = ? OR (? = 'new' AND s.status <> 'ended'))
  ORDER BY s.created_at DESC LIMIT 1`;
const SESSION_TABLES = ['swipe_sessions', 'trips', 'destinations', 'guides'];

const YES_SQL = 'SELECT poi_id, user_id FROM swipe_yes_votes WHERE session_id = ?';
const MATCH_SQL = `SELECT m.id, m.poi_id, m.day_no, m.change_set_id, m.user_ids,
    (SELECT i.id FROM trip_ideas i WHERE i.trip_id = m.trip_id AND i.poi_id = m.poi_id
      AND i.deleted_at IS NULL LIMIT 1) AS idea_id
  FROM swipe_matches m WHERE m.session_id = ? ORDER BY m.created_at, m.id`;
const IDEAS_SQL = `SELECT id, poi_id, backer_ids FROM trip_ideas
  WHERE trip_id = ? AND deleted_at IS NULL AND poi_id IS NOT NULL`;
const PLACES_SQL = `SELECT id, name, category, price_level, address FROM pois
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

/** A match with where it went and who said yes. */
export interface SessionMatch extends MatchRow {
  readonly changeSetId: string | null;
  readonly ideaId: string | null;
  readonly userIds: readonly string[];
}

interface MatchSqlRow {
  readonly id: string;
  readonly poi_id: string;
  readonly day_no: number | null;
  readonly change_set_id: string | null;
  readonly user_ids: string | null;
  readonly idea_id: string | null;
}

export interface DeckPlace {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly price_level: number | null;
  readonly address: string | null;
}

export function useSwipeSession(
  tripId: string,
  sessionRef: string,
  options: { readonly saveYes?: boolean } = {},
) {
  const saveYes = options.saveYes === true;
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
  const matchRows = useLiveRows<MatchSqlRow>(MATCH_SQL, sessionId === null ? null : [sessionId], [
    'swipe_matches',
    'trip_ideas',
  ]).rows;
  const ideaRows = useLiveRows<{ id: string; poi_id: string; backer_ids: string | null }>(
    IDEAS_SQL,
    saveYes ? [tripId] : null,
    ['trip_ideas'],
  ).rows;
  const ideas = useMemo(
    (): DeckIdea[] =>
      ideaRows.map((row) => ({
        id: row.id,
        poiId: row.poi_id,
        backerIds: textArray(row.backer_ids),
      })),
    [ideaRows],
  );
  // Ideas this phone asked for by place, until their rows sync back.
  const sentIdeas = useRef<Record<string, string>>({});
  const live = usePresence('swipe', sessionId);

  const start = useCommand(startSwipeSessionCommand);
  const vote = useCommand(swipeVoteCommand);
  const undo = useCommand(undoSwipeCommand);
  const end = useCommand(endSwipeSessionCommand);
  const saveIdea = useCommand(saveIdeaCommand);
  const removeIdea = useCommand(removeIdeaCommand);

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
  const key = swipedKey(me, sessionId);
  if (swiped.id !== key) {
    setSwiped({ id: key, map: key === null ? {} : readSwiped(key) });
  }
  const keep = useCallback(
    (next: Swiped) => {
      if (key === null) return;
      storage.set(key, JSON.stringify(next));
      setSwiped({ id: key, map: next });
    },
    [key],
  );

  const voteSend = vote.send;
  const undoSend = undo.send;
  const endSend = end.send;
  const saveIdeaSend = saveIdea.send;
  const removeIdeaSend = removeIdea.send;
  const swipe = useCallback(
    (poiId: string, verdict: Verdict) => {
      if (sessionId === null) return;
      keep(withSwipe(swiped.map, poiId, verdict));
      void voteSend({ session_id: sessionId, place_id: poiId, verdict });
      if (saveYes && yesSaves(verdict, poiId, me, ideas)) {
        const ideaId = generateUuidV7();
        sentIdeas.current = { ...sentIdeas.current, [poiId]: ideaId };
        void saveIdeaSend({ idea_id: ideaId, trip_id: tripId, poi_id: poiId, source: 'swipe' });
      }
    },
    [ideas, keep, me, saveIdeaSend, saveYes, sessionId, swiped.map, tripId, voteSend],
  );
  const undoLast = useCallback(() => {
    const last = lastSwiped(swiped.map);
    if (sessionId === null || last === null) return;
    keep(withoutSwipe(swiped.map, last));
    void undoSend({ session_id: sessionId, place_id: last });
    // A yes this phone saved comes back out of Ideas with it (only the swiper's own save).
    const ideaId =
      saveYes && swiped.map[last] === 'yes'
        ? ideaToTakeBack(last, me, ideas, sentIdeas.current)
        : null;
    if (ideaId !== null) void removeIdeaSend({ idea_id: ideaId });
  }, [ideas, keep, me, removeIdeaSend, saveYes, sessionId, swiped.map, undoSend]);
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
      (): SessionMatch[] =>
        matchRows.map((entry) => ({
          id: entry.id,
          poiId: entry.poi_id,
          dayNo: entry.day_no,
          changeSetId: entry.change_set_id,
          ideaId: entry.idea_id,
          userIds: textArray(entry.user_ids),
        })),
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
