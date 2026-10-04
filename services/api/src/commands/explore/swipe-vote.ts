/**
 * `swipe_vote` (docs/api-contracts.md §4.6): a participant's verdict on one card. The match is
 * arbitrated here, once: votes on one card are serialised by a transaction lock on (session,
 * card), so the vote that brings the yes count to the session's rule (two, or one on a solo trip)
 * sees every earlier yes and inserts the one match; the unique (session, card) row makes a replay
 * or a late yes find it instead. With the planning redesign on, the match drops into the trip's
 * Ideas with every yes voter as a backer; with it off it becomes a ChangeSet suggestion for the
 * organiser, as installed apps expect. The crew hears that someone voted, never how: a "no" stays
 * its voter's (owner-read table).
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, SWIPE_RT, swipeVotePayloadSchema, type SwipeVoteResult } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { matchToChangeSet } from '../../explore/match-to-changeset';
import { ideaForPlace, matchToIdea, planningRedesignOn } from '../../planning/ideas/match-to-idea';
import { defineCommand } from '../_framework/define-command';
import { loadSession, publishSwipe, type SwipeSessionRow } from './swipe-access';

function requireLiveCard(session: SwipeSessionRow, placeId: string): void {
  if (session.status === 'ended')
    throw new DomainError('STATE_INVALID', { reason: 'session_ended' });
  if (!session.deck.some((card) => card.poi_id === placeId)) {
    throw new DomainError('VALIDATION', { reason: 'not_in_deck' });
  }
}

async function existingMatch(tx: pg.PoolClient, sessionId: string, placeId: string) {
  const { rows } = await tx.query<{
    id: string;
    change_set_id: string | null;
    day_no: number | null;
  }>('SELECT id, change_set_id, day_no FROM swipe_matches WHERE session_id = $1 AND poi_id = $2', [
    sessionId,
    placeId,
  ]);
  return rows[0];
}

type MatchRow = { id: string; change_set_id: string | null; day_no: number | null };
type MatchReport = NonNullable<SwipeVoteResult['match']>;

function matchResult(row: MatchRow): MatchReport {
  return {
    match_id: row.id,
    change_set_id: row.change_set_id,
    day_no: row.day_no,
    status: row.change_set_id === null ? 'unslotted' : 'suggested',
  };
}

/** A match that went to Ideas reports its idea (only with the redesign on). */
function ideaResult(row: MatchRow, ideaId: string): MatchReport {
  return { ...matchResult(row), status: 'idea', idea_id: ideaId };
}

/**
 * An earlier match on this card. With the redesign on, a later yes joins the idea's backers, so
 * everyone who said yes is on it however the votes raced.
 */
async function reportEarlier(
  tx: pg.PoolClient,
  vote: { readonly tripId: string; readonly placeId: string; readonly uid: string; yes: boolean },
  row: MatchRow,
): Promise<MatchReport> {
  if (row.change_set_id !== null || !(await planningRedesignOn(tx))) return matchResult(row);
  const ideaId = vote.yes
    ? await matchToIdea(tx, {
        tripId: vote.tripId,
        poiId: vote.placeId,
        userIds: [vote.uid],
        actorId: vote.uid,
      })
    : await ideaForPlace(tx, vote.tripId, vote.placeId);
  return ideaId === null ? matchResult(row) : ideaResult(row, ideaId);
}

export const swipeVoteCommand = defineCommand({
  name: 'swipe_vote',
  v: 1,
  schema: swipeVotePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireLiveCard(await loadSession(tx, payload.session_id), payload.place_id);
  },
  handle: async (tx, payload, ctx): Promise<SwipeVoteResult> => {
    const session = await loadSession(tx, payload.session_id);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `swipe:${session.id}:${payload.place_id}`,
    ]);
    const yesVoters = await asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO swipe_votes (session_id, trip_id, user_id, poi_id, verdict)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, user_id, poi_id) DO UPDATE SET verdict = EXCLUDED.verdict`,
        [session.id, session.trip_id, ctx.uid, payload.place_id, payload.verdict],
      );
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM swipe_yes_votes WHERE session_id = $1 AND poi_id = $2
          ORDER BY created_at, user_id`,
        [session.id, payload.place_id],
      );
      return rows.map((row) => row.user_id);
    });
    const base = { trip_id: session.trip_id, session_id: session.id, poi_id: payload.place_id };
    await appendDomainEvent(tx, {
      type: 'swipe.voted',
      aggregateKind: 'swipe_session',
      aggregateId: session.id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: session.trip_id,
      payload: { ...base, user_id: ctx.uid },
    });
    await publishSwipe(tx, session.id, SWIPE_RT.vote, { uid: ctx.uid, poi_id: payload.place_id });

    const result = { session_id: session.id, place_id: payload.place_id, verdict: payload.verdict };
    const voteOf = () => ({
      tripId: session.trip_id,
      placeId: payload.place_id,
      uid: ctx.uid,
      yes: yesVoters.includes(ctx.uid),
    });
    const earlier = await existingMatch(tx, session.id, payload.place_id);
    if (earlier !== undefined) {
      return {
        ...result,
        match: await reportEarlier(tx, voteOf(), earlier),
      };
    }
    if (yesVoters.length < session.match_rule) return { ...result, match: null };

    const inserted = await asSystemRole(tx, () =>
      tx.query<{ id: string }>(
        `INSERT INTO swipe_matches (session_id, trip_id, poi_id, user_ids) VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, poi_id) DO NOTHING RETURNING id`,
        [session.id, session.trip_id, payload.place_id, yesVoters],
      ),
    );
    const matchId = inserted.rows[0]?.id;
    if (matchId === undefined) {
      const raced = await existingMatch(tx, session.id, payload.place_id);
      return {
        ...result,
        match: raced === undefined ? null : await reportEarlier(tx, voteOf(), raced),
      };
    }
    if (await planningRedesignOn(tx)) {
      const ideaId = await matchToIdea(tx, {
        tripId: session.trip_id,
        poiId: payload.place_id,
        userIds: yesVoters,
        actorId: ctx.uid,
      });
      await appendDomainEvent(tx, {
        type: 'swipe.matched',
        aggregateKind: 'swipe_session',
        aggregateId: session.id,
        actorKind: 'system',
        actorId: null,
        tripId: session.trip_id,
        payload: { ...base, match_id: matchId, change_set_id: null },
      });
      await publishSwipe(tx, session.id, SWIPE_RT.match, {
        poi_id: payload.place_id,
        match_id: matchId,
        idea_id: ideaId,
        user_ids: yesVoters,
      });
      const row = { id: matchId, change_set_id: null, day_no: null };
      return { ...result, match: ideaResult(row, ideaId) };
    }
    const slot = await matchToChangeSet(tx, {
      matchId,
      sessionId: session.id,
      tripId: session.trip_id,
      poiId: payload.place_id,
      userIds: yesVoters,
      startedBy: session.started_by,
    });
    await asSystemRole(tx, () =>
      tx.query('UPDATE swipe_matches SET change_set_id = $2, day_no = $3 WHERE id = $1', [
        matchId,
        slot.change_set_id,
        slot.day_no,
      ]),
    );
    await appendDomainEvent(tx, {
      type: 'swipe.matched',
      aggregateKind: 'swipe_session',
      aggregateId: session.id,
      actorKind: 'system',
      actorId: null,
      tripId: session.trip_id,
      payload: { ...base, match_id: matchId, change_set_id: slot.change_set_id },
    });
    await publishSwipe(tx, session.id, SWIPE_RT.match, {
      poi_id: payload.place_id,
      match_id: matchId,
      change_set_id: slot.change_set_id,
      day_no: slot.day_no,
      user_ids: yesVoters,
    });
    return {
      ...result,
      match: matchResult({ id: matchId, change_set_id: slot.change_set_id, day_no: slot.day_no }),
    };
  },
});
