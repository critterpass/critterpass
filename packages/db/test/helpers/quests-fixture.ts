import type pg from 'pg';

/**
 * Quest rows on the fixture trip: one live quest with its progress and the organiser's sign-up, and
 * 450 quest XP granted through `app.grant_xp` (the crew row, the organiser's row, the crew's total
 * at level 2 and its level-2 sticker).
 */
export async function seedQuestRows(
  tx: pg.PoolClient,
  f: { tripId: string; crewId: string; organiser: string },
): Promise<void> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO quests (trip_id, local_date, slot, template, params, metric, target, reward, title,
       body, source, starts_at, ends_at)
     VALUES ($1, current_date, 0, 'log_expenses', '{"n": 3}', 'expenses', 3,
       '{"xp": 450, "sticker": null, "form_id": null}', 'RECEIPT KEEPERS', 'Log 3 expenses today.',
       'fallback', now() - interval '1 hour', now() + interval '12 hours')
     RETURNING id`,
    [f.tripId],
  );
  const questId = rows[0]!.id;
  await tx.query('INSERT INTO quest_progress (quest_id, trip_id, value) VALUES ($1, $2, 1)', [
    questId,
    f.tripId,
  ]);
  await tx.query('INSERT INTO quest_signups (quest_id, trip_id, user_id) VALUES ($1, $2, $3)', [
    questId,
    f.tripId,
    f.organiser,
  ]);
  await tx.query(`SELECT * FROM app.grant_xp($1, $2, ARRAY[$3]::uuid[], 450, 'quest', $4, now())`, [
    f.crewId,
    f.tripId,
    f.organiser,
    questId,
  ]);
}
