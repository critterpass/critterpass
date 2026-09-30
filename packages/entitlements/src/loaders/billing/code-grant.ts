/** Pass+ time from a redeemed gift or promo code, running to the redemption's period end. */
import type { CodeGrantSource } from '../../sources';
import { iso, type RunQuery } from './query';

export async function loadCodeGrantSources(run: RunQuery, uid: string): Promise<CodeGrantSource[]> {
  const rows = await run<{ new_period_end: Date }>(
    `SELECT r.new_period_end FROM code_redemptions r JOIN codes c ON c.id = r.code_id
      WHERE r.user_id = $1 AND c.status <> 'revoked' AND r.applied_as = 'server_grant'`,
    [uid],
  );
  return rows.map((row) => ({ kind: 'code_grant', expiresAt: iso(row.new_period_end) }));
}
