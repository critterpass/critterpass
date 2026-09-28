/**
 * `member.updated` on `crew:<crew_id>` (docs/api-contracts-async.md §1.2): a hint that one member's
 * profile rows changed, sent to every crew the member is active in. It names the fields only; the
 * rows themselves arrive through the `crew_people` stream.
 */
import { enqueueRealtime } from '@cp/db';
import { crewChannel } from '@cp/domain';
import type pg from 'pg';

export type MemberField = 'display_name' | 'home_airport' | 'avatar' | 'pass' | 'taste';

export async function announceMemberUpdated(
  tx: pg.PoolClient,
  uid: string,
  fields: readonly MemberField[],
): Promise<void> {
  const { rows } = await tx.query<{ crew_id: string }>(
    "SELECT crew_id FROM crew_members WHERE user_id = $1 AND status = 'active'",
    [uid],
  );
  for (const { crew_id: crewId } of rows) {
    await enqueueRealtime(tx, {
      channel: crewChannel(crewId),
      payload: { type: 'member.updated', user_id: uid, fields },
    });
  }
}
