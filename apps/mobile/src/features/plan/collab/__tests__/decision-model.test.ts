/**
 * The live decision and its threads from synced rows plus the queue: a queued vote moves mine at
 * once and can change the leader, a tie has no leader, a vote near its deadline reads as closing
 * and a closed one carries its winner; a thread shows my queued comment and +1 before they sync,
 * and the guide's reply hangs off the comment its change cites until it is undone.
 */
import { describe, expect, it } from '@jest/globals';

import { buildDecision, buildThread, guideReplies } from '../decision-model';
import type { BallotRow, OptionRow, PollRow, QueuedCollabRow } from '../queries';

const NOW = Date.parse('2026-10-16T02:00:00Z');
const ME = 'u-winston';

const poll: PollRow = {
  id: 'poll-boat',
  trip_id: 'trip',
  kind: 'day_option',
  status: 'open',
  question: 'Boat day: pick one',
  closes_at: '2026-10-16T08:00:00Z',
  winner_option_id: null,
  eligible_voter_ids: null,
  created_by: 'u-maya',
};

const option = (id: string, name: string): OptionRow => ({
  id,
  kind: 'poi',
  ref_id: `poi-${id}`,
  label: name,
  position: 0,
  eliminated_at: null,
  poi_name: name,
  poi_category: 'island',
  amount_minor: null,
  currency: null,
});
const OPTIONS = [option('penida', 'Nusa Penida'), option('gili', 'Gili T')];
const ballot = (user: string, optionId: string): BallotRow => ({
  option_id: optionId,
  user_id: user,
  cast_at: null,
});

function queued(cmd: string, payload: unknown, id = `op-${cmd}`): QueuedCollabRow {
  return { id, cmd, envelope: JSON.stringify({ payload }), created_at: '2026-10-16T01:59:00Z' };
}

describe('live decision', () => {
  const ballots = [
    ballot('u-maya', 'penida'),
    ballot('u-jordan', 'penida'),
    ballot('u-alex', 'gili'),
    ballot(ME, 'penida'),
  ];

  it('counts voters, crowns the one option ahead and moves my queued vote at once', () => {
    const base = buildDecision({ poll, options: OPTIONS, ballots, queued: [], uid: ME, now: NOW });
    expect(base.leaderId).toBe('penida');
    expect(base.options.map((o) => o.voters.length)).toEqual([3, 1]);
    expect(base.phase).toBe('open');
    const moved = buildDecision({
      poll,
      options: OPTIONS,
      ballots,
      queued: [queued('cast_ballot', { poll_id: poll.id, option_id: 'gili' })],
      uid: ME,
      now: NOW,
    });
    expect(moved.myVote).toBe('gili');
    expect(moved.leaderId).toBeNull();
    expect(moved.tie).toBe(true);
  });

  it('reads as closing near the deadline and carries the winner once closed', () => {
    const soon = { ...poll, closes_at: '2026-10-16T02:10:00Z' };
    expect(
      buildDecision({ poll: soon, options: OPTIONS, ballots: [], queued: [], uid: ME, now: NOW })
        .phase,
    ).toBe('closing');
    const closed = { ...poll, status: 'closed', winner_option_id: 'penida' };
    const decision = buildDecision({
      poll: closed,
      options: OPTIONS,
      ballots,
      queued: [],
      uid: ME,
      now: NOW,
    });
    expect([decision.phase, decision.winnerId]).toEqual(['closed', 'penida']);
  });
});

describe('comment threads', () => {
  const comment = {
    id: 'c-stairs',
    anchor_kind: 'poi_in_option',
    anchor_id: 'penida:kelingking',
    author_id: 'u-jordan',
    body: 'Can we skip the stairs down? My knee’s still bad.',
    edited_at: null,
    deleted_at: null,
    created_at: '2026-10-16T01:56:00Z',
  };
  const anchors = [{ kind: 'poi_in_option' as const, id: 'penida:kelingking' }];

  it('shows my queued comment and +1 before they sync', () => {
    const thread = buildThread({
      anchors,
      comments: [comment, { ...comment, id: 'c-other', anchor_id: 'gili:reef' }],
      plusOnes: [{ comment_id: 'c-stairs', user_id: 'u-rin', created_at: '2026-10-16T01:57:00Z' }],
      queued: [
        queued('plusone_comment', { comment_id: 'c-stairs' }),
        queued('add_comment', {
          comment_id: 'c-mine',
          trip_id: 'trip',
          target: anchors[0],
          body: 'Same, boat only',
        }),
      ],
      replies: new Map(),
      uid: ME,
    });
    expect(thread.map((c) => [c.id, c.plusOnes, c.queued])).toEqual([
      ['c-stairs', ['u-rin', ME], false],
      ['c-mine', [], true],
    ]);
  });

  it('hangs the guide’s reply off the comment its change cites, until undone or expired', () => {
    const action = {
      id: 'ga-1',
      change_set_id: 'cs-1',
      status: 'done',
      undo_until: '2026-10-16T03:00:00Z',
      ops: JSON.stringify([
        {
          op: 'swap',
          target: 'x',
          reason: 'r',
          affected_user_ids: [],
          booking_impact: false,
          source_ids: ['comment:c-stairs'],
        },
      ]),
      reply: 'Brought the boat to the beach instead.',
    };
    expect(guideReplies([action], [], NOW).get('c-stairs')).toEqual({
      actionId: 'ga-1',
      text: action.reply,
    });
    expect(
      guideReplies([action], [queued('undo_guide_action', { action_id: 'ga-1' })], NOW).size,
    ).toBe(0);
    expect(guideReplies([{ ...action, undo_until: '2026-10-16T01:00:00Z' }], [], NOW).size).toBe(0);
  });
});
