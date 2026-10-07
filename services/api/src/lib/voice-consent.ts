/**
 * The voice consent (`consents.purpose = ai_voice`), checked on the server: a traveller's speech,
 * or the words recognised from it, only go to a speech or model vendor while that consent stands.
 * The app asks for it before the guide first listens; this is what holds when a client does not.
 */
import { withSystem } from '@cp/db';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

/** Throws `CONSENT_REQUIRED` unless `uid` has granted `ai_voice` and not withdrawn it. */
export async function requireVoiceConsent(pool: pg.Pool, uid: string): Promise<void> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ granted: boolean }>(
      `SELECT granted_at IS NOT NULL AND revoked_at IS NULL AS granted FROM consents
        WHERE user_id = $1 AND purpose = 'ai_voice'`,
      [uid],
    ),
  );
  if (rows[0]?.granted !== true) throw new DomainError('CONSENT_REQUIRED', { purpose: 'ai_voice' });
}
