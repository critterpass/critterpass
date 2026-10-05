/**
 * Who hears about a plan change put to a vote, in the inbox and in crew chat (the kinds are
 * declared in @cp/domain `PLAN_CHANGE_INBOX_KINDS`): a card for everyone who can vote and has not
 * (never its author), settled by their vote or by the close; and when the vote closes, one entry
 * for everyone it touched plus one system line in crew chat saying what was decided and what
 * changed ("Bà Nà Hills · Wed 07:00" went in, or the plan stays as it was). Only change sets that
 * went to a vote are announced: the guide's own applied changes speak for themselves.
 */
import { loadPollState } from '@cp/db';
import {
  ensureInboxKinds,
  PLAN_CHANGE_INBOX_KINDS,
  PLAN_CHANGE_CHAT_LINE,
  PLAN_CHANGE_INBOX_KIND,
  planChangeLineBody,
  pollVoteResolveKey,
  type InboxAction,
  type PlanChangeSummary,
} from '@cp/domain';
import type pg from 'pg';

import { registerInboxFanout, type FanoutEvent } from '../inbox/fanout';
import { localClock } from '../notify/policy';
import { str } from '../setup/facts';

const OPEN: InboxAction = { id: 'open', style: 'primary' };

interface Side {
  readonly day_no?: number;
  readonly starts_at?: string;
  readonly tz?: string;
  readonly poi_id?: string | null;
  readonly custom_place?: { readonly name?: string } | null;
  readonly notes?: string | null;
}

interface Op {
  readonly op: string;
  readonly before?: Side | null;
  readonly after?: Side | null;
  readonly accepted?: boolean;
}

interface VotedChange {
  readonly tripId: string;
  readonly authorId: string | null;
  readonly pollId: string;
  readonly voters: readonly string[];
  readonly pending: readonly string[];
  readonly open: boolean;
  readonly closesAt: Date | null;
  readonly summary: PlanChangeSummary;
}

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** What the change is, from its first accepted op: the place, and the day and time it lands. */
async function summarise(
  tx: pg.PoolClient,
  tripId: string,
  tz: string,
  ops: readonly Op[],
): Promise<PlanChangeSummary> {
  const accepted = ops.filter((op) => op.accepted !== false);
  const first = accepted[0];
  const side = first?.after ?? first?.before ?? null;
  const other = first?.before ?? null;
  const poiId = side?.poi_id ?? other?.poi_id ?? null;
  const named = await tx.query<{ name: string | null }>('SELECT name FROM pois WHERE id = $1', [
    poiId,
  ]);
  const title =
    named.rows[0]?.name ??
    side?.custom_place?.name ??
    other?.custom_place?.name ??
    side?.notes ??
    '';
  let date: string | null = null;
  let time: string | null = null;
  if (side?.starts_at !== undefined) {
    const clock = localClock(new Date(side.starts_at), side.tz ?? tz);
    date = clock.date;
    time = hhmm(clock.minutes);
  } else if (side?.day_no !== undefined) {
    const day = await tx.query<{ date: string | null }>(
      `SELECT d.date::text AS date FROM plan_days d JOIN trips t ON t.current_version_id = d.version_id
        WHERE t.id = $1 AND d.day_no = $2`,
      [tripId, side.day_no],
    );
    date = day.rows[0]?.date ?? null;
  }
  return { op: first?.op ?? '', title, date, time, count: accepted.length };
}

/** The change set and its vote; undefined for one that never went to a vote. */
async function votedChange(
  tx: pg.PoolClient,
  event: FanoutEvent,
): Promise<VotedChange | undefined> {
  const { rows } = await tx.query<{
    trip_id: string;
    author_id: string | null;
    poll_id: string | null;
    ops: Op[];
    tz: string | null;
  }>(
    `SELECT cs.trip_id, cs.author_id, cs.poll_id, cs.ops, coalesce(t.tz, d.tz) AS tz
       FROM change_sets cs JOIN trips t ON t.id = cs.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE cs.id = $1`,
    [str(event, 'change_set_id')],
  );
  const row = rows[0];
  if (row === undefined || row.poll_id === null) return undefined;
  const state = await loadPollState(tx, row.poll_id);
  if (state === undefined) return undefined;
  const voted = new Set(state.ballots.map((ballot) => ballot.user_id));
  return {
    tripId: row.trip_id,
    authorId: row.author_id,
    pollId: row.poll_id,
    voters: state.poll.eligible_voter_ids,
    pending: state.poll.eligible_voter_ids.filter((uid) => !voted.has(uid)),
    open: state.poll.status === 'open',
    closesAt: state.poll.closes_at,
    summary: await summarise(tx, row.trip_id, row.tz ?? 'UTC', row.ops),
  };
}

function registerVoteNeeded(): void {
  registerInboxFanout({
    kind: PLAN_CHANGE_INBOX_KIND.voteNeeded,
    async audience(tx, event) {
      const change = await votedChange(tx, event);
      return change?.open === true ? change.pending.filter((uid) => uid !== change.authorId) : [];
    },
    async build(tx, event, uid) {
      const change = await votedChange(tx, event);
      const changeSetId = str(event, 'change_set_id');
      if (change?.open !== true || changeSetId === null || !change.pending.includes(uid)) {
        return null;
      }
      return {
        tripId: change.tripId,
        actorId: change.authorId,
        data: { change_set_id: changeSetId, poll_id: change.pollId, ...change.summary },
        actions: [OPEN],
        deepLink: `/trip/${change.tripId}/review/${changeSetId}`,
        expiresAt: change.closesAt,
        resolveKey: pollVoteResolveKey(uid, change.pollId),
      };
    },
  });
}

/**
 * The close, once per change set: the vote cards of everyone who had not voted are settled (there
 * is nothing left to answer), and crew chat gets one system line saying what was decided.
 */
async function announceClose(
  tx: pg.PoolClient,
  event: FanoutEvent,
  change: VotedChange,
  line: string,
): Promise<void> {
  const changeSetId = str(event, 'change_set_id');
  await tx.query('SELECT app.resolve_inbox_items($1::text[], $2)', [
    change.voters.map((uid) => pollVoteResolveKey(uid, change.pollId)),
    event.occurredAt,
  ]);
  // The line names the change set, so a replayed event posts nothing twice.
  await tx.query(
    `INSERT INTO messages (crew_id, trip_id, sender_kind, type, ref_kind, ref_id, body)
     SELECT t.crew_id, t.id, 'system', 'system', $2, $3, $4 FROM trips t
      WHERE t.id = $1 AND NOT EXISTS (
        SELECT 1 FROM messages m
         WHERE m.crew_id = t.crew_id AND m.type = 'system' AND m.ref_id = $3 AND m.ref_kind = $2)`,
    [change.tripId, line, changeSetId, planChangeLineBody(change.summary)],
  );
}

function registerDecided(kind: string, outcome: 'applied' | 'kept' | 'ran_out'): void {
  registerInboxFanout({
    kind,
    async audience(tx, event) {
      const change = await votedChange(tx, event);
      if (change === undefined) return [];
      const line =
        outcome === 'ran_out'
          ? PLAN_CHANGE_CHAT_LINE.ranOut
          : outcome === 'kept'
            ? PLAN_CHANGE_CHAT_LINE.kept
            : change.summary.op === 'add' && change.summary.count === 1
              ? PLAN_CHANGE_CHAT_LINE.added
              : PLAN_CHANGE_CHAT_LINE.changed;
      await announceClose(tx, event, change, line);
      return [
        ...new Set([...change.voters, ...(change.authorId === null ? [] : [change.authorId])]),
      ];
    },
    async build(tx, event) {
      const change = await votedChange(tx, event);
      const changeSetId = str(event, 'change_set_id');
      if (change === undefined || changeSetId === null) return null;
      return {
        tripId: change.tripId,
        actorId: change.authorId,
        data: { change_set_id: changeSetId, outcome, ...change.summary },
        deepLink: `/trip/${change.tripId}/plan`,
      };
    },
  });
}

let registered = false;

/** Registers the plan change's inbox fan-outs once per process. */
export function registerPlanInboxFanouts(): void {
  if (registered) return;
  registered = true;
  ensureInboxKinds(PLAN_CHANGE_INBOX_KINDS);
  registerVoteNeeded();
  registerDecided(PLAN_CHANGE_INBOX_KIND.applied, 'applied');
  registerDecided(PLAN_CHANGE_INBOX_KIND.kept, 'kept');
  registerDecided(PLAN_CHANGE_INBOX_KIND.ranOut, 'ran_out');
}
