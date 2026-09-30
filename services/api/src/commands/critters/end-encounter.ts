/**
 * `end_encounter`: the ring drained to nothing (`wandered_off`, the 3l-5 card) or the traveller
 * walked away from the scene (`abandoned`). Only an active encounter ends; a late replay after a
 * befriend changes nothing.
 */
import { endEncounterPayloadSchema, type EndEncounterPayload } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { isActive, ownEncounter } from './shared';

export const endEncounterCommand = defineCommand({
  name: 'end_encounter',
  v: 1,
  schema: endEncounterPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: EndEncounterPayload) => {
    await ownEncounter(tx, payload.encounter_id);
  },
  handle: async (tx, payload) => {
    const encounter = await ownEncounter(tx, payload.encounter_id);
    if (!isActive(encounter.state)) return { encounter_id: encounter.id, ended: false };
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE encounters SET state = $2, resolved_at = $3, dwell_s = greatest(dwell_s, $4)
          WHERE id = $1 AND state IN ('accruing', 'ready')`,
        [payload.encounter_id, payload.outcome, payload.ended_at, Math.round(payload.dwell_s)],
      ),
    );
    return { encounter_id: encounter.id, ended: true };
  },
});
