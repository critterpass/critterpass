/**
 * The manifest's live read: the crew's active members in join order with their display names, from
 * the synced `crew_members` and `users` rows. Rows arrive as the join replicates.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { watchRows } from '@/data/status/watch-rows';

export interface MemberRow {
  readonly user_id: string;
  readonly role: string;
  readonly display_name: string | null;
}

const UUID = /^[0-9a-f-]{36}$/iu;

export function watchCrewMembers(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  onRows: (rows: MemberRow[]) => void,
): () => void {
  // watchRows takes no parameters; the crew id is a server uuid, checked before it is inlined.
  if (!UUID.test(crewId)) return () => undefined;
  return watchRows<MemberRow>(
    db,
    `SELECT cm.user_id, cm.role, u.display_name
       FROM crew_members cm LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.crew_id = '${crewId}' AND cm.status = 'active'
      ORDER BY cm.created_at, cm.id`,
    ['crew_members', 'users'],
    onRows,
  );
}
