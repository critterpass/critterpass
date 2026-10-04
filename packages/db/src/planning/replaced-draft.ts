/**
 * An organiser's private draft that was replaced and is not worth keeping as history: the empty
 * plan nobody touched, or her previous edit by hand. Deleting it keeps the organisers' sync small
 * (every organiser version's days ride their stream) and the draft history to the versions that
 * matter. A version something else still points at (a proposal built from it, a redraft of it, a
 * later version) stays, superseded.
 */
import type pg from 'pg';

/**
 * Deletes a replaced draft with its days, stops, legs and check issues when nothing else points
 * at it; a version something still needs stays, superseded. Returns whether it was deleted.
 */
export async function dropReplacedDraft(tx: pg.PoolClient, versionId: string): Promise<boolean> {
  await tx.query('SAVEPOINT drop_replaced_draft');
  try {
    await tx.query('DELETE FROM plan_check_issues WHERE version_id = $1', [versionId]);
    await tx.query('DELETE FROM plan_legs WHERE version_id = $1', [versionId]);
    await tx.query('DELETE FROM plan_items WHERE version_id = $1', [versionId]);
    await tx.query('DELETE FROM plan_days WHERE version_id = $1', [versionId]);
    // A fit worked out on the deleted draft is worked out again by the next plan check.
    await tx.query(
      'UPDATE trip_ideas SET fit = NULL, fit_version_id = NULL WHERE fit_version_id = $1',
      [versionId],
    );
    await tx.query("DELETE FROM itinerary_versions WHERE id = $1 AND visibility = 'organiser'", [
      versionId,
    ]);
    await tx.query('RELEASE SAVEPOINT drop_replaced_draft');
    return true;
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT drop_replaced_draft');
    // Foreign key violation: a proposal, a job or a later version still refers to it.
    if ((error as { code?: string }).code === '23503') return false;
    throw error;
  }
}
