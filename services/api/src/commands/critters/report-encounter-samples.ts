/**
 * `report_encounter_samples`: the device's per-sample dwell rows for its own encounter — a time,
 * a distance band, accuracy and speed; never a coordinate. Stored for seven days as the raw
 * material the evidence hash commits to; a replayed batch adds nothing twice.
 */
import {
  DomainError,
  reportEncounterSamplesPayloadSchema,
  type ReportEncounterSamplesPayload,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { ownEncounter } from './shared';

/** Samples one encounter may hold (an hour at 1 Hz is plenty for any dwell). */
export const MAX_SAMPLES_PER_ENCOUNTER = 5000;

export const reportEncounterSamplesCommand = defineCommand({
  name: 'report_encounter_samples',
  v: 1,
  schema: reportEncounterSamplesPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: ReportEncounterSamplesPayload) => {
    const encounter = await ownEncounter(tx, payload.encounter_id);
    if (encounter.verification !== null) {
      throw new DomainError('STATE_INVALID', { reason: 'encounter_resolved' });
    }
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM encounter_samples WHERE encounter_id = $1',
        [payload.encounter_id],
      );
      const room = MAX_SAMPLES_PER_ENCOUNTER - (rows[0]?.n ?? 0);
      if (room <= 0) throw new DomainError('PAYLOAD_TOO_LARGE', { reason: 'samples_full' });
      const samples = payload.samples.slice(0, room);
      const inserted = await tx.query(
        `INSERT INTO encounter_samples (encounter_id, user_id, at, distance_band, accuracy_m, speed_mps)
         SELECT $1, $2, s.at, s.distance_band, s.accuracy_m, s.speed_mps
           FROM jsonb_to_recordset($3::jsonb)
             AS s(at timestamptz, distance_band text, accuracy_m real, speed_mps real)
         ON CONFLICT (encounter_id, at) DO NOTHING`,
        [payload.encounter_id, ctx.uid, JSON.stringify(samples)],
      );
      return { stored: inserted.rowCount ?? 0 };
    }),
});
