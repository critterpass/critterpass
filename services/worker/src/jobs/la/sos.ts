/**
 * The crew SOS loader: an open SOS goes on every crewmate's lock screen at once (push-to-start, top
 * priority) with how many are coming and how long since the sender's phone last reported in; the
 * sender's own phone starts its activity itself, so the server only keeps that one updated. The
 * position never leaves the app. Resolving ends it (a false alarm reads "cancelled"); a stale SOS,
 * one that reached the server too late to alert anyone, is never shown.
 */
import { buildSosLaAttributes, buildSosLaState, LA_COPY, type SosLaInput } from '@cp/domain';

import { ROUTINE, type LaLoader, type LaUrgency } from './snapshot';

interface SosRow {
  id: string;
  trip_id: string;
  user_id: string;
  status: 'open' | 'responding' | 'resolved' | 'stale';
  false_alarm: boolean;
  sender: string | null;
  coming: number;
  last_seen_at: Date | null;
}

const LINGER_MS = 15 * 60_000;
const URGENT: LaUrgency = { priority: 10 };

function laState(row: SosRow): SosLaInput['state'] {
  if (row.status === 'resolved' || row.status === 'stale') {
    return row.false_alarm ? 'cancelled' : 'resolved';
  }
  return row.status;
}

export const sosLoader: LaLoader = async ({ tx, refId, now }) => {
  const { rows } = await tx.query<SosRow>(
    `SELECT h.id, h.trip_id, h.user_id, h.status, h.false_alarm,
            split_part(trim(u.display_name), ' ', 1) AS sender,
            (SELECT count(*)::int FROM jsonb_each(h.responses) r
              WHERE r.value ->> 'state' = 'coming') AS coming,
            (SELECT max(f.at) FROM location_fixes f WHERE f.share_id = h.share_id) AS last_seen_at
       FROM help_sessions h JOIN users u ON u.id = h.user_id
      WHERE h.id = $1 AND h.kind = 'sos'`,
    [refId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const crew = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND holds_seat
      ORDER BY created_at, user_id`,
    [row.trip_id],
  );
  const audience = crew.rows.map((member) => member.user_id);
  const sender = row.sender === null || row.sender === '' ? '?' : row.sender;
  const input: SosLaInput = {
    sosId: row.id,
    senderName: sender,
    state: laState(row),
    responders: row.coming,
    lastSeenAt: row.last_seen_at,
  };
  return {
    tripId: row.trip_id,
    live: row.status === 'open' || row.status === 'responding',
    audience,
    startAudience: audience.filter((uid) => uid !== row.user_id),
    attributes: () => Promise.resolve(buildSosLaAttributes(input)),
    state: (seq) => buildSosLaState(input, now, seq),
    startAlert: { title: LA_COPY.sosStartTitle, body: LA_COPY.sosStartBody, vars: { sender } },
    endsAt: null,
    lingerMs: LINGER_MS,
    // A new state or responder is urgent; the last-seen minutes ticking over is not.
    urgency: (prev, next) =>
      prev?.['state'] !== next['state'] || prev?.['responders'] !== next['responders']
        ? URGENT
        : ROUTINE,
  };
};
