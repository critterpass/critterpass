import type pg from 'pg';

/**
 * Guide chat rows: the organiser's private thread and the trip's group thread, one message in each,
 * the organiser's queued question, custom phrase card and phrase practice, and one crew-chat turn.
 */
export async function seedGuideChat(
  tx: pg.PoolClient,
  f: { tripId: string; crewId: string; organiser: string },
): Promise<void> {
  const { rows } = await tx.query<{ id: string; mode: string }>(
    `INSERT INTO guide_threads (user_id, trip_id, crew_id, mode)
     VALUES ($1, $2, NULL, 'private'), ($1, $2, $3, 'group') RETURNING id, mode`,
    [f.organiser, f.tripId, f.crewId],
  );
  const privateThread = rows.find((row) => row.mode === 'private')!.id;
  const groupThread = rows.find((row) => row.mode === 'group')!.id;
  await tx.query(
    `INSERT INTO guide_messages (thread_id, trip_id, role, author_id, content)
     VALUES ($1, $3, 'user', $4, 'matrix probe'), ($2, $3, 'user', $4, 'matrix probe')`,
    [privateThread, groupThread, f.tripId, f.organiser],
  );
  await tx.query(
    `INSERT INTO queued_guide_questions (user_id, thread_id, trip_id, text, tz, queued_for, answer_after)
     VALUES ($1, $2, $3, 'matrix probe', 'UTC', '2026-01-01', now() + interval '1 day')`,
    [f.organiser, privateThread, f.tripId],
  );
  await tx.query(
    `INSERT INTO custom_phrase_cards (user_id, trip_id, purpose, language, register)
     VALUES ($1, $2, 'matrix probe', 'vi', 'polite')`,
    [f.organiser, f.tripId],
  );
  await tx.query('INSERT INTO phrase_progress (user_id, phrase_id) VALUES ($1, uuidv7())', [
    f.organiser,
  ]);
  await tx.query(
    `INSERT INTO guide_crew_turns (crew_id, trip_id, kind, trigger_key)
     VALUES ($1, $2, 'proactive', 'matrix-probe')`,
    [f.crewId, f.tripId],
  );
}
