/**
 * Feedback and idea-board rows for the shared permission fixture: the organiser sent a ticket,
 * voted for the member's published idea and has a rating-prompt row, and has an idea of their own
 * still waiting for review.
 */
import type pg from 'pg';

export interface HelpFixtureInput {
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

export const MATRIX_PUBLIC_IDEA_TITLE = 'Packing lists per crew';
export const MATRIX_PENDING_IDEA_TITLE = 'Split the bill by photo';

export async function seedHelpRows(tx: pg.PoolClient, input: HelpFixtureInput): Promise<void> {
  const { organiser, member, tripId } = input;
  await tx.query(
    `INSERT INTO feedback_tickets (user_id, mood, category, body, include_device_info, trip_id,
       reply_channel, reply_due_at, app_version, sent_at)
     VALUES ($1, 'good', 'planning', 'Love the day view', false, $2, 'email',
       now() + interval '2 days', '1.0.0', now())`,
    [organiser, tripId],
  );
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO ideas (author_id, title, locale, status) VALUES ($1, $2, 'en', 'open')
     RETURNING id`,
    [member, MATRIX_PUBLIC_IDEA_TITLE],
  );
  await tx.query(
    `INSERT INTO ideas (author_id, title, locale, status) VALUES ($1, $2, 'en', 'pending_review')`,
    [organiser, MATRIX_PENDING_IDEA_TITLE],
  );
  await tx.query(
    `INSERT INTO idea_votes (idea_id, user_id, month_key) VALUES ($1, $2, '2026-10')`,
    [rows[0]!.id, organiser],
  );
  await tx.query(
    `INSERT INTO rating_prompts (user_id, trip_id, shown, shown_at) VALUES ($1, $2, true, now())`,
    [organiser, tripId],
  );
}
