/**
 * What the poll inbox cards and pushes read about a poll: its state, the crew, who asked, the
 * trip's guide, the live answers, the deep link and the result line.
 */
import { loadPollState, tallyOf, type PollState } from '@cp/db';
import { INLINE_POLL_OPTIONS_MAX, type InboxAction } from '@cp/domain';
import type pg from 'pg';

import type { FanoutEvent } from '../inbox/fanout';
import type { NotificationSender, RoutedEvent } from '../notify/register';

export const DEFAULT_GUIDE: NotificationSender = { kind: 'guide', id: 'tokek', name: 'Tokek' };

export const str = (
  event: { readonly payload: Readonly<Record<string, unknown>> },
  key: string,
) => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

export interface PollFacts {
  readonly state: PollState;
  readonly crew: string;
  readonly asker: string;
  readonly guide: NotificationSender;
}

export async function pollFacts(
  tx: pg.PoolClient,
  pollId: string | null,
): Promise<PollFacts | undefined> {
  if (pollId === null) return undefined;
  const state = await loadPollState(tx, pollId);
  if (state === undefined) return undefined;
  const { rows } = await tx.query<{
    crew: string;
    asker: string | null;
    guide_slug: string | null;
    guide_name: string | null;
  }>(
    `SELECT c.name AS crew, split_part(trim(u.display_name), ' ', 1) AS asker,
            g.slug AS guide_slug, g.name AS guide_name
       FROM polls p
       JOIN crews c ON c.id = p.crew_id
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN trips t ON t.id = p.trip_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE p.id = $1`,
    [pollId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    state,
    crew: row.crew,
    asker: row.asker ?? '',
    guide:
      row.guide_slug !== null && row.guide_name !== null
        ? { kind: 'guide', id: row.guide_slug, name: row.guide_name }
        : DEFAULT_GUIDE,
  };
}

export function liveOptions(state: PollState) {
  return state.options.filter((option) => option.eliminated_at === null);
}

/** Up to three answers as inline actions (more than three: the card opens the poll instead). */
export function inlineVotes(state: PollState): InboxAction[] {
  const live = liveOptions(state);
  if (live.length > INLINE_POLL_OPTIONS_MAX) return [{ id: 'open', style: 'primary' }];
  return live.map((option, i) => ({
    id: `vote_${i + 1}`,
    style: 'secondary' as const,
    command: 'cast_ballot',
    payload: { poll_id: state.poll.id, option_id: option.id },
  }));
}

export function deepLink(state: PollState): string {
  return state.poll.kind === 'destination'
    ? `/vote/${state.poll.id}`
    : `/crew/${state.poll.crew_id}/chat`;
}

export function pollData(state: PollState, guide: NotificationSender): Record<string, unknown> {
  return {
    poll_id: state.poll.id,
    kind: state.poll.kind,
    stage: state.poll.stage,
    question: state.poll.question,
    options: liveOptions(state)
      .slice(0, INLINE_POLL_OPTIONS_MAX)
      .map((option) => ({ id: option.id, label: option.label })),
    guide: guide.id,
  };
}

export async function pendingVoters(
  tx: pg.PoolClient,
  event: FanoutEvent | RoutedEvent,
): Promise<string[]> {
  const state = await loadPollState(tx, str(event, 'poll_id') ?? '');
  return state === undefined ? [] : [...tallyOf(state).pendingVoterIds];
}

/** The winner's label and the score ("4–2": winner, then the best of the rest). */
export function resultData(state: PollState): { winner_label: string; score: string } {
  const tally = tallyOf(state);
  const winner = state.poll.winner_option_id;
  const winnerCount = tally.options.find((o) => o.optionId === winner)?.count ?? 0;
  const rest = Math.max(
    0,
    ...tally.options.filter((o) => o.optionId !== winner).map((o) => o.count),
  );
  const label = state.options.find((option) => option.id === winner)?.label ?? '';
  return { winner_label: label, score: `${winnerCount}–${rest}` };
}
