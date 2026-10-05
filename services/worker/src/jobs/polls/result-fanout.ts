/**
 * Who hears about a poll and what they see: the inbox cards (vote needed, final open, organiser
 * pick, result) and the pushes (N-01 on a new poll and on the destination final, N-02 to voters
 * still pending before the close, N-03 the destination winner). Items and pushes carry ids and
 * short values; the app renders every word it can from synced rows.
 */
import { loadPollState } from '@cp/db';
import { pollPickResolveKey, pollVoteResolveKey, POLL_INBOX_KIND } from '@cp/domain';

import { registerInboxFanout } from '../inbox/fanout';
import {
  deepLink,
  inlineVotes,
  pendingVoters,
  pollData,
  pollFacts,
  resultData,
  str,
} from './facts';
import { registerPushes } from './pushes';

function registerInboxKinds(): void {
  registerInboxFanout({
    kind: POLL_INBOX_KIND.voteNeeded,
    async audience(tx, event) {
      const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
      if (state === undefined) return [];
      return state.poll.eligible_voter_ids.filter((uid) => uid !== state.poll.created_by);
    },
    async build(tx, event, uid) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.status !== 'open') return null;
      const { state } = facts;
      return {
        crewId: state.poll.crew_id,
        tripId: state.poll.trip_id,
        actorId: state.poll.created_by,
        data: pollData(state, facts.guide),
        actions: inlineVotes(state),
        deepLink: deepLink(state),
        expiresAt: state.poll.stage === 'board' ? null : state.poll.closes_at,
        resolveKey: pollVoteResolveKey(uid, state.poll.id),
      };
    },
  });
  registerInboxFanout({
    kind: POLL_INBOX_KIND.finalOpen,
    audience: async (tx, event) => (str(event, 'to') === 'final' ? pendingVoters(tx, event) : []),
    async build(tx, event, uid) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.stage !== 'final') return null;
      const { state } = facts;
      return {
        crewId: state.poll.crew_id,
        tripId: state.poll.trip_id,
        actorId: null,
        data: pollData(state, facts.guide),
        actions: inlineVotes(state),
        deepLink: deepLink(state),
        expiresAt: state.poll.closes_at,
        resolveKey: pollVoteResolveKey(uid, state.poll.id),
      };
    },
  });
  registerInboxFanout({
    kind: POLL_INBOX_KIND.pickNeeded,
    async audience(tx, event) {
      const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
      if (state === undefined) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'",
        [state.poll.trip_id],
      );
      return rows.length > 0 ? rows.map((row) => row.user_id) : [state.poll.created_by ?? ''];
    },
    async build(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined) return null;
      return {
        crewId: facts.state.poll.crew_id,
        tripId: facts.state.poll.trip_id,
        actorId: null,
        data: {
          ...pollData(facts.state, facts.guide),
          tied_option_ids: event.payload['tied_option_ids'],
        },
        actions: [{ id: 'open', style: 'primary' }],
        deepLink: deepLink(facts.state),
        resolveKey: pollPickResolveKey(facts.state.poll.id),
      };
    },
  });
  registerInboxFanout({
    kind: POLL_INBOX_KIND.result,
    async audience(tx, event) {
      const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
      // A plan change's vote says what was decided in its own words (jobs/plan/inbox.ts), not as
      // "yes won 2–0".
      if (state?.poll.kind === 'changeset_approval') return [];
      return state?.poll.eligible_voter_ids ?? [];
    },
    async build(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.winner_option_id === null) return null;
      return {
        crewId: facts.state.poll.crew_id,
        tripId: facts.state.poll.trip_id,
        actorId: null,
        data: { ...pollData(facts.state, facts.guide), ...resultData(facts.state) },
        deepLink: deepLink(facts.state),
      };
    },
  });
}

let registered = false;

/** Registers the poll inbox kinds and pushes once per process. */
export function registerPollFanouts(): void {
  if (registered) return;
  registered = true;
  registerInboxKinds();
  registerPushes();
}

/** Test-only: allow a fresh registration after the registries were reset. */
export function resetPollFanoutsForTests(): void {
  registered = false;
}
