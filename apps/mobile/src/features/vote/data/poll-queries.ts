/**
 * The local queries the poll surfaces read (synced rows plus this device's queued ballots), so a
 * poll renders and takes votes offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { CAST_BALLOT, RETRACT_BALLOT } from './vote-commands';

export const POLL_SQL = `SELECT id, crew_id, trip_id, kind, stage, status, question, created_by,
    eligible_voter_ids, closes_at, allow_change, winner_option_id, result, closed_at
  FROM polls WHERE id = ?`;

export const OPTIONS_SQL = `SELECT id, label, position, ref_id, pitch_id, proposed_by, eliminated_at
  FROM poll_options WHERE poll_id = ? ORDER BY position, created_at`;

export const BALLOTS_SQL = 'SELECT option_id, user_id, cast_at FROM ballots WHERE poll_id = ?';

export const PENDING_BALLOTS_SQL = `SELECT cmd, json_extract(envelope, '$.payload.option_id') AS option_id,
    created_at
  FROM commands
  WHERE cmd IN ('${CAST_BALLOT}', '${RETRACT_BALLOT}')
    AND json_extract(envelope, '$.payload.poll_id') = ?
  ORDER BY seq`;

export const POLL_TABLES = ['polls', 'poll_options', 'ballots', 'commands'];

/** The crew's open destination poll (Home's vote slot). */
export const OPEN_DESTINATION_SQL = `SELECT id FROM polls
  WHERE crew_id = ? AND kind = 'destination' AND status = 'open'
  ORDER BY created_at DESC LIMIT 1`;

/** People on a poll: names and crew colours, for avatars. */
export const PEOPLE_SQL = `SELECT u.id, u.display_name, m.colour
  FROM crew_members m JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? ORDER BY m.created_at, u.id`;
export const PEOPLE_TABLES = ['crew_members', 'users'];

/** A destination poll's places, for stickers, colours and guides. */
export const PLACES_SQL = `SELECT d.id, d.slug, d.name, d.coverage, d.colour, s.guide_slug, s.code
  FROM destinations d LEFT JOIN critter_sets s ON s.id = d.critter_set_id
  WHERE d.id IN (SELECT ref_id FROM poll_options WHERE poll_id = ?)`;
export const PLACES_TABLES = ['destinations', 'critter_sets', 'poll_options'];

/** Closed destination polls whose reveal this user has not seen. */
export const PENDING_REVEAL_SQL = `SELECT r.poll_id FROM poll_reveals r
  JOIN polls p ON p.id = r.poll_id
  WHERE r.user_id = ? AND r.seen_at IS NULL AND p.status = 'closed'
    AND r.poll_id NOT IN (SELECT json_extract(envelope, '$.payload.poll_id') FROM commands
                           WHERE cmd = 'mark_reveal_seen')
  ORDER BY p.closed_at DESC LIMIT 1`;
export const REVEAL_TABLES = ['poll_reveals', 'polls', 'commands'];
