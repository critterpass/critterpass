/**
 * Facts the hub reads from the phone: how many ideas are open to votes, and how support answered
 * this traveller's last ticket (email or Inbox).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useLiveRows } from './live-rows';

const IDEAS_SQL = "SELECT count(*) AS n FROM ideas WHERE status IN ('open', 'planned', 'building')";
const CHANNEL_SQL = 'SELECT reply_channel FROM feedback_tickets ORDER BY created_at DESC LIMIT 1';

export function useIdeasToVote(): number | null {
  const { rows, loaded } = useLiveRows<{ n: number }>(IDEAS_SQL, [], ['ideas']);
  return loaded ? (rows[0]?.n ?? 0) : null;
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
