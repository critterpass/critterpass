/**
 * The `place_profile` moderation subject (docs/api-contracts.md §4.17): a place's AI profile, shown
 * without prior review and labelled with its sources. A report is the safety net: it writes the
 * profile again from fresh pages (`places.profile` with `force`, at most once per place an hour) and
 * puts the report in the ops queue, where hiding takes the profile off the place page. The subject
 * id is the place's id.
 */
import { sendInTx } from '@cp/db';
import { PLACES_QUEUES, placesProfileKey, type PlacesProfileJob } from '@cp/domain';
import type pg from 'pg';

import { registerModerationKind } from '../admin/moderation-intake';

export const PLACE_PROFILE_MODERATION_KIND = 'place_profile';

/** A report re-runs a profile at most this often per place. */
export const PROFILE_REPORT_RERUN_HOURS = 1;

/** A re-run for a report goes ahead of warm-ups, like a reader's first request. */
const REPORT_PRIORITY = 10;

/** Queues a forced re-run unless the place was already reported within the hour (as app_system). */
export async function rerunReportedProfile(tx: pg.PoolClient, poiId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `SELECT 1 FROM ops.moderation_filings f
       JOIN moderation_reports r ON r.id = f.report_id
      WHERE r.target_kind = $1 AND r.target_id = $2
        AND f.filed_at > now() - make_interval(hours => $3)
      LIMIT 1`,
    [PLACE_PROFILE_MODERATION_KIND, poiId, PROFILE_REPORT_RERUN_HOURS],
  );
  if (rowCount !== 0) return false;
  const job: PlacesProfileJob = { poi_id: poiId, force: true };
  await sendInTx(tx, PLACES_QUEUES.profile, job, {
    singletonKey: placesProfileKey(poiId),
    priority: REPORT_PRIORITY,
  });
  return true;
}

registerModerationKind({
  kind: PLACE_PROFILE_MODERATION_KIND,
  verdicts: ['approve', 'hide'],
  exists: async (tx, id) =>
    (await tx.query("SELECT 1 FROM place_profiles WHERE poi_id = $1 AND status = 'ready'", [id]))
      .rowCount === 1,
  // The console reads the place itself; the profile's lines and sources are on its place page.
  preview: async (tx, id) => {
    const { rows } = await tx.query<{ name: string; address: string | null }>(
      'SELECT name, address FROM pois WHERE id = $1',
      [id],
    );
    const place = rows[0];
    if (place === undefined) return { type: 'missing', title: 'AI place profile' };
    return {
      type: 'text',
      title: `AI place profile: ${place.name}`,
      text: `${place.address ?? 'No address'} · place ${id}. Reporting re-ran the profile from fresh pages; hide takes it off the place page.`,
    };
  },
  // Written by the model: there is no author to ban.
  author: () => Promise.resolve(null),
  apply: async (tx, id) => {
    await tx.query(
      `UPDATE place_profiles SET status = 'declined', error = 'hidden_by_ops', updated_at = now()
        WHERE poi_id = $1`,
      [id],
    );
  },
  reported: async (tx, id) => {
    await rerunReportedProfile(tx, id);
  },
});
