/**
 * `set_consent {purpose, granted, copy_version}`: records the caller's decision for one purpose
 * (visit detection, analytics, marketing, sharing dietary flags, the Help share, voice) on their single `consents` row. A grant stamps
 * `granted_at` and clears any revocation; a refusal or withdrawal stamps `revoked_at` and keeps
 * the original grant time as history. Onboarding, Settings and the visit consent sheet all call it.
 * The dietary consent is mirrored onto the caller's dietary profile, whose trigger then shares or
 * withdraws their derived flags on every open trip at once.
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
    if (payload.purpose === 'dietary_visibility') {
      await tx.query(
        `UPDATE dietary_profiles SET consent_at = CASE WHEN $2 THEN now() END
          WHERE user_id = $1 AND (consent_at IS NULL) = $2`,
        [ctx.uid, payload.granted],
      );
    }
    return { purpose: payload.purpose, granted: payload.granted };
  },
});
