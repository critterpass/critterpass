/**
 * `set_dietary_profile` (docs/api-contracts.md §4.1; fields per the guide's capture screen): the
 * owner's diet, allergies, things to avoid, spice level and accessibility notes (sealed with the
 * field keyring). Sharing flags with the crew (`visibility = crew_flags`) needs the
 * `dietary_visibility` consent first; the profile's trigger then derives the flags for every open
 * trip of the owner's crews, and nobody else ever reads the profile itself.
 */
import { crypto as dbCrypto } from '@cp/db';
import {
  DomainError,
  setDietaryProfilePayloadSchema,
  type SetDietaryProfileResult,
} from '@cp/domain';

import type { FieldKeyring } from '../bookings/deps';
import { defineCommand } from '../_framework/define-command';

export function createSetDietaryProfileCommand(deps: { readonly keyring: FieldKeyring }) {
  return defineCommand({
    name: 'set_dietary_profile',
    v: 1,
    schema: setDietaryProfilePayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx): Promise<SetDietaryProfileResult> => {
      const { rows } = await tx.query<{ granted: boolean }>(
        `SELECT granted_at IS NOT NULL AND revoked_at IS NULL AS granted FROM consents
          WHERE user_id = $1 AND purpose = 'dietary_visibility'`,
        [ctx.uid],
      );
      const consented = rows[0]?.granted === true;
      if (payload.visibility === 'crew_flags' && !consented) {
        throw new DomainError('CONSENT_REQUIRED', { purpose: 'dietary_visibility' });
      }
      const notes =
        payload.accessibility_notes === null || payload.accessibility_notes === ''
          ? null
          : dbCrypto.encryptField(payload.accessibility_notes, deps.keyring);
      // As the owner: RLS keeps the row theirs, and the column grants keep `user_id` fixed.
      await tx.query(
        `INSERT INTO dietary_profiles
           (user_id, diet, allergies, avoid, spice, accessibility_notes_enc, visibility, consent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 THEN now() END)
         ON CONFLICT (user_id) DO UPDATE SET
           diet = EXCLUDED.diet, allergies = EXCLUDED.allergies, avoid = EXCLUDED.avoid,
           spice = EXCLUDED.spice, accessibility_notes_enc = EXCLUDED.accessibility_notes_enc,
           visibility = EXCLUDED.visibility,
           consent_at = CASE WHEN $8 THEN coalesce(dietary_profiles.consent_at, now()) END`,
        [
          ctx.uid,
          payload.diet,
          [...new Set(payload.allergies)],
          [...new Set(payload.avoid)],
          payload.spice,
          notes,
          payload.visibility,
          consented,
        ],
      );
      return {
        visibility: payload.visibility,
        flags_shared: payload.visibility === 'crew_flags' && consented,
      };
    },
  });
}
