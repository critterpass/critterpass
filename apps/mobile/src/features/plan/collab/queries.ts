/**
 * Local queries for live collaboration: a decision poll with its options, ballots and places, the
 * comments anchored to plan items or options with their +1s, and the guide's undoable changes with
 * its replies. Queued votes, comments and +1s are read back from the command queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const POLL_SQL = `SELECT id, trip_id, kind, status, question, closes_at, winner_option_id,
    eligible_voter_ids, created_by
  FROM polls WHERE id = ?`;
export const POLL_TABLES = ['polls'];

export interface PollRow {
  readonly id: string;
  readonly trip_id: string | null;
  readonly kind: string;
  readonly status: string;
  readonly question: string | null;
  readonly closes_at: string | null;
  readonly winner_option_id: string | null;
  readonly eligible_voter_ids: string | null;
  readonly created_by: string | null;
}

export const OPTIONS_SQL = `SELECT o.id, o.kind, o.ref_id, o.label, o.position, o.eliminated_at,
    p.name AS poi_name, p.category AS poi_category, q.amount_minor, q.currency
  FROM poll_options o
  LEFT JOIN pois p ON o.kind = 'poi' AND p.id = o.ref_id
  LEFT JOIN price_quotes q ON q.id = o.frozen_quote_id
  WHERE o.poll_id = ? ORDER BY o.position, o.id`;
export const OPTIONS_TABLES = ['poll_options', 'pois', 'price_quotes'];

export interface OptionRow {
  readonly id: string;
  readonly kind: string | null;
  readonly ref_id: string | null;
  readonly label: string | null;
  readonly position: number | null;
  readonly eliminated_at: string | null;
  readonly poi_name: string | null;
  readonly poi_category: string | null;
  readonly amount_minor: number | null;
  readonly currency: string | null;
}

export const BALLOTS_SQL = `SELECT option_id, user_id, cast_at FROM ballots WHERE poll_id = ?
  ORDER BY cast_at, user_id`;
export const BALLOTS_TABLES = ['ballots'];

export interface BallotRow {
  readonly option_id: string;
  readonly user_id: string;
  readonly cast_at: string | null;
}

export const COMMENTS_SQL = `SELECT id, anchor_kind, anchor_id, author_id, body, edited_at,
    deleted_at, created_at
  FROM comments WHERE trip_id = ? ORDER BY created_at, id`;
export const PLUS_ONES_SQL = `SELECT comment_id, user_id, created_at FROM comment_plus_ones
  WHERE trip_id = ? ORDER BY created_at`;
export const COMMENTS_TABLES = ['comments', 'comment_plus_ones'];

export interface CommentRow {
  readonly id: string;
  readonly anchor_kind: string;
  readonly anchor_id: string;
  readonly author_id: string;
  readonly body: string | null;
  readonly edited_at: string | null;
  readonly deleted_at: string | null;
  readonly created_at: string;
}

export interface PlusOneRow {
  readonly comment_id: string;
  readonly user_id: string;
  readonly created_at: string;
}

/** Collaboration commands still in the local queue (votes, comments, +1s). */
export const QUEUED_COLLAB_SQL = `SELECT id, cmd, envelope, created_at FROM commands
  WHERE cmd IN ('cast_ballot', 'add_comment', 'plusone_comment', 'unplusone_comment',
    'undo_guide_action') ORDER BY seq`;
export const QUEUED_COLLAB_TABLES = ['commands'];

export interface QueuedCollabRow {
  readonly id: string;
  readonly cmd: string;
  readonly envelope: string;
  readonly created_at: string;
}

/** The guide's changes on this trip that can still be undone, with its reply. */
export const GUIDE_ACTIONS_SQL = `SELECT a.id, a.change_set_id, a.status, a.undo_until, c.ops,
    (SELECT e.text FROM activity_events e
      WHERE e.object_id = a.change_set_id AND e.actor_kind = 'guide'
      ORDER BY e.at DESC LIMIT 1) AS reply
  FROM guide_actions a LEFT JOIN change_sets c ON c.id = a.change_set_id
  WHERE a.trip_id = ? AND a.status = 'done' AND a.reversible = 1
  ORDER BY a.created_at DESC`;
export const GUIDE_ACTIONS_TABLES = ['guide_actions', 'change_sets', 'activity_events'];

export interface GuideActionRow {
  readonly id: string;
  readonly change_set_id: string | null;
  readonly status: string;
  readonly undo_until: string | null;
  readonly ops: string | null;
  readonly reply: string | null;
}
