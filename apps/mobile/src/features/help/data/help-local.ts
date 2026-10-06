/**
 * Facts the hub reads: how many ideas on the public board (an api read, the last good copy offline)
 * are open to votes, and how support answered this traveller's last ticket (email or Inbox).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { dataOf } from '@/data/travel-data/freshness';
import { useIdeasBoard, type BoardIdea } from '@/data/travel-data/shared-content';

import { useLiveRows } from './live-rows';

const VOTABLE = new Set(['open', 'planned', 'building']);
const CHANNEL_SQL = 'SELECT reply_channel FROM feedback_tickets ORDER BY created_at DESC LIMIT 1';

/** How many board ideas still take votes; null while unknown (loading, or offline with no copy). */
export function ideasToVote(ideas: readonly BoardIdea[] | undefined): number | null {
  return ideas === undefined ? null : ideas.filter((idea) => VOTABLE.has(idea.status)).length;
}

export function useIdeasToVote(): number | null {
  return ideasToVote(dataOf(useIdeasBoard())?.ideas);
}

export function useReplyChannel(): 'email' | 'inbox' | null {
  const { rows } = useLiveRows<{ reply_channel: string | null }>(
    CHANNEL_SQL,
    [],
    ['feedback_tickets'],
  );
  const channel = rows[0]?.reply_channel;
  return channel === 'email' || channel === 'inbox' ? channel : null;
}
