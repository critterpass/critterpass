/**
 * The poll pushes: N-01 a vote needs you (a new poll, and the destination final to those who must
 * vote again), N-02 the reminders to voters still pending, N-03 the destination winner.
 */
import { loadPollState } from '@cp/db';
import {
  VOTE_CLOSING_BODY,
  VOTE_DESTINATION_BODY,
  VOTE_FINAL_BODY,
  VOTE_NEEDED_BODY,
  VOTE_NEEDED_TITLE,
  voteRevealLink,
  WINNER_BODY,
  WINNER_TITLE,
} from '@cp/domain';

import { registerNotification } from '../notify/register';
import {
  deepLink,
  liveOptions,
  pendingVoters,
  pollData,
  pollFacts,
  resultData,
  str,
} from './facts';

export function registerPushes(): void {
  registerNotification({
    key: 'vote_needs_you',
    event: 'poll.created',
    async audience(tx, event) {
      const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
      if (state === undefined) return [];
      return state.poll.eligible_voter_ids.filter((uid) => uid !== state.poll.created_by);
    },
    async compose(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.status !== 'open') return null;
      const { state } = facts;
      const destination = state.poll.kind === 'destination';
      return {
        title: VOTE_NEEDED_TITLE,
        body: destination ? VOTE_DESTINATION_BODY : VOTE_NEEDED_BODY,
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          asker: facts.asker,
          question: state.poll.question ?? '',
          count: liveOptions(state).length,
        },
        sender: facts.guide,
        crewId: state.poll.crew_id,
        tripId: state.poll.trip_id,
        deepLink: deepLink(state),
        ctx: pollData(state, facts.guide),
        needsYou: true,
        collapseVars: { poll_id: state.poll.id },
      };
    },
  });
  registerNotification({
    key: 'vote_needs_you',
    event: 'poll.stage_changed',
    audience: async (tx, event) => (str(event, 'to') === 'final' ? pendingVoters(tx, event) : []),
    async compose(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.stage !== 'final') return null;
      const [first, second] = liveOptions(facts.state);
      return {
        title: VOTE_NEEDED_TITLE,
        body: VOTE_FINAL_BODY,
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          first: first?.label ?? '',
          second: second?.label ?? '',
        },
        sender: facts.guide,
        crewId: facts.state.poll.crew_id,
        tripId: facts.state.poll.trip_id,
        deepLink: deepLink(facts.state),
        ctx: pollData(facts.state, facts.guide),
        needsYou: true,
        collapseVars: { poll_id: facts.state.poll.id },
      };
    },
  });
  registerNotification({
    key: 'vote_closing',
    event: 'poll.closing_soon',
    audience: pendingVoters,
    async compose(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      const slot = str(event, 'slot') === '2h' ? '2h' : '24h';
      if (facts === undefined || facts.state.poll.status !== 'open') return null;
      return {
        title: VOTE_NEEDED_TITLE,
        body: VOTE_CLOSING_BODY[slot],
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          question:
            facts.state.poll.question ??
            liveOptions(facts.state)
              .map((o) => o.label)
              .join(' / '),
        },
        sender: facts.guide,
        crewId: facts.state.poll.crew_id,
        tripId: facts.state.poll.trip_id,
        deepLink: deepLink(facts.state),
        ctx: pollData(facts.state, facts.guide),
        needsYou: true,
        collapseVars: { poll_id: facts.state.poll.id },
      };
    },
    dedupeKey: (event, uid) => `vote_closing:${str(event, 'poll_id')}:${str(event, 'slot')}:${uid}`,
  });
  registerNotification({
    key: 'winner_revealed',
    event: 'poll.closed',
    async audience(tx, event) {
      if (str(event, 'kind') !== 'destination') return [];
      const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
      return state?.poll.eligible_voter_ids ?? [];
    },
    async compose(tx, event) {
      const facts = await pollFacts(tx, str(event, 'poll_id'));
      if (facts === undefined || facts.state.poll.winner_option_id === null) return null;
      const result = resultData(facts.state);
      return {
        title: WINNER_TITLE,
        body: WINNER_BODY,
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          place: result.winner_label,
          score: result.score,
        },
        sender: facts.guide,
        crewId: facts.state.poll.crew_id,
        tripId: facts.state.poll.trip_id,
        deepLink: voteRevealLink(facts.state.poll.id),
        ctx: { poll_id: facts.state.poll.id },
        collapseVars: { poll_id: facts.state.poll.id },
      };
    },
  });
}
