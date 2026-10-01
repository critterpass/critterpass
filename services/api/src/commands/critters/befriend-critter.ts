/**
 * `befriend_critter`: the hold ceremony (or the accessible Befriend action) completed on a ready
 * encounter. Stores the signed evidence (C3, 30 days, never synced), marks the encounter
 * befriended with verification `pending`, files a pending entry the pass shows as pending (no
 * name until verified), and queues `critter.verify` in the same transaction. Evidence that turns
 * out implausible is revoked by the verifier ("This one slipped away"), not rejected here, so an
 * offline befriend always lands and resolves the same way online or late.
 */
import {
  befriendCritterPayloadSchema,
  CRITTER_QUEUES,
  DomainError,
  type BefriendCritterPayload,
} from '@cp/domain';
import { sendInTx } from '@cp/db';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { ownEncounter } from './shared';

function checkTimes(payload: BefriendCritterPayload, startedAt: Date, now: Date): void {
  const ready = Date.parse(payload.ready_at);
  const befriended = Date.parse(payload.befriended_at);
  if (ready < startedAt.getTime() - 60_000 || befriended < ready) {
    throw new DomainError('VALIDATION', { reason: 'times_out_of_order' });
  }
  if (befriended > now.getTime() + 5 * 60_000) {
    throw new DomainError('VALIDATION', { reason: 'befriended_in_future' });
  }
}

export const befriendCritterCommand = defineCommand({
  name: 'befriend_critter',
  v: 1,
  schema: befriendCritterPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: BefriendCritterPayload, ctx) => {
    const encounter = await ownEncounter(tx, payload.encounter_id);
    if (
      encounter.state !== 'accruing' &&
      encounter.state !== 'ready' &&
      encounter.state !== 'befriended'
    ) {
      throw new DomainError('STATE_INVALID', { reason: 'encounter_ended' });
    }
    checkTimes(payload, encounter.started_at, ctx.clock.serverNow);
  },
  handle: async (tx, payload, ctx) => {
    const encounter = await ownEncounter(tx, payload.encounter_id);
    if (encounter.state === 'befriended') {
      return { encounter_id: encounter.id, verification: encounter.verification };
    }
    return asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE encounters
            SET state = 'befriended', verification = 'pending', ready_at = $2, resolved_at = $3,
                dwell_s = $4
          WHERE id = $1`,
        [
          payload.encounter_id,
          payload.ready_at,
          payload.befriended_at,
          Math.round(payload.evidence_bundle.dwell.inside_s),
        ],
      );
      await tx.query(
        `INSERT INTO encounter_evidence (encounter_id, user_id, evidence, attestation, skew_ms)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (encounter_id) DO NOTHING`,
        [
          payload.encounter_id,
          ctx.uid,
          JSON.stringify({ ...payload.evidence_bundle, via: payload.via }),
          JSON.stringify(payload.attestation),
          ctx.clock.skewMs,
        ],
      );
      // A group find (co-presence) is granted to the whole crew at once, never one by one.
      await tx.query(
        `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, poi_id, trip_id,
           source, encounter_id, verification)
         SELECT $1, f.id, f.critter_id, $3, $4, $5, 'encounter', $6, 'pending'
           FROM critter_forms f JOIN spawn_rules r ON r.form_id = f.id
          WHERE f.id = $2 AND r.id = $7 AND r.kind <> 'co_presence'
         ON CONFLICT (user_id, form_id) DO NOTHING`,
        [
          ctx.uid,
          encounter.form_id,
          payload.befriended_at,
          encounter.poi_id,
          encounter.trip_id,
          encounter.id,
          encounter.spawn_rule_id,
        ],
      );
      await sendInTx(
        tx,
        CRITTER_QUEUES.verify,
        { encounter_id: encounter.id },
        {
          singletonKey: encounter.id,
        },
      );
      return { encounter_id: encounter.id, verification: 'pending' };
    });
  },
});
