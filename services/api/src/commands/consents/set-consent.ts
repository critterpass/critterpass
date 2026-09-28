/**
 * `set_consent {purpose, granted, copy_version}`: records the caller's decision for one purpose
 * (visit detection, analytics, marketing) on their single `consents` row. A grant stamps
 * `granted_at` and clears any revocation; a refusal or withdrawal stamps `revoked_at` and keeps
 * the original grant time as history. Onboarding, Settings and the visit consent sheet all call it.
 */
import { setConsentPayloadSchema, type SetConsentResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export const setConsentCommand = defineCommand({
  name: 'set_consent',
  v: 1,
  schema: setConsentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<SetConsentResult> => {
    await tx.query(
      `INSERT INTO consents (user_id, purpose, granted_at, revoked_at, copy_version)
       VALUES ($1, $2, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN NULL ELSE now() END, $4)
       ON CONFLICT (user_id, purpose) DO UPDATE SET
         granted_at = CASE WHEN $3 THEN now() ELSE consents.granted_at END,
         revoked_at = CASE WHEN $3 THEN NULL ELSE now() END,
         copy_version = coalesce(EXCLUDED.copy_version, consents.copy_version)`,
      [ctx.uid, payload.purpose, payload.granted, payload.copy_version ?? null],
    );
    return { purpose: payload.purpose, granted: payload.granted };
  },
});
